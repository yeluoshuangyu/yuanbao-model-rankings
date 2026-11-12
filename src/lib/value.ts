import type { Catalog } from './schema';
import { performanceBoards } from './performance-data';
import { performanceCategories, type PerformanceCategory } from './performance-categories';
import { money, quote, scenarios, type Filters } from './ranking';
import { escapeHtml } from './render';
import { paretoFrontier } from './insights';

export const valueCategories = ['text', 'code', 'vision'] as const;
export type ValueCategory = typeof valueCategories[number];

export interface ValuePoint { modelId: string; name: string; providerId: string; score: number; price: number; mode?: string }

const normalize = (value: string) => value.toLowerCase().replace(/^arena-/, '').replace(/[^a-z0-9]/g, '');

export interface ValueBoard { points: ValuePoint[]; listed: number; matched: number; publishedAt: string; sourceUrl: string }
/** Join Arena scores to catalog prices. Same model family appears with several serving modes: keep the best score. */
export function valueBoard(catalog: Catalog, filters: Filters, category: ValueCategory, today?: string): ValueBoard {
  const snapshot = performanceBoards[category as PerformanceCategory];
  const byApi = new Map(catalog.models.map(model => [normalize(model.apiId), model]));
  const byName = new Map(catalog.models.map(model => [normalize(model.name), model]));
  const best = new Map<string, ValuePoint>();
  for (const entry of snapshot.models) {
    if (!('score' in entry) || typeof entry.score !== 'number') continue;
    const model = byApi.get(normalize(entry.sourceModel)) ?? byName.get(normalize(entry.name)) ?? byName.get(normalize(entry.sourceModel));
    if (!model || model.status === 'retired') continue;
    const prices = quote(model, { ...filters, scenario: 'chat', inputTokens: scenarios.chat.input, outputTokens: scenarios.chat.output }, filters.fx ?? catalog.meta.usdToCny, today);
    if (!prices || prices.task <= 0) continue;
    const current = best.get(model.id);
    if (!current || entry.score > current.score) best.set(model.id, { modelId: model.id, name: model.name, providerId: model.providerId, score: entry.score, price: prices.task, mode: 'mode' in entry ? entry.mode : undefined });
  }
  return { points: [...best.values()].sort((a, b) => a.price - b.price || b.score - a.score), listed: snapshot.models.length, matched: best.size, publishedAt: snapshot.publishedAt, sourceUrl: snapshot.sourceUrl ?? performanceCategories[category].url };
}

const priceLabel = (value: number) => `¥${money(value, true)}`;

/** Log-price × score scatter with the cost/performance frontier drawn on top. */
export function renderScatter(points: ValuePoint[], catalog: Catalog, category: ValueCategory): string {
  const label = performanceCategories[category].label;
  if (points.length < 3) return `<p class="muted">${escapeHtml(label)}榜可用数据不足，暂时无法绘制性价比图。</p>`;
  const width = 760, height = 420, pad = { l: 58, r: 18, t: 18, b: 46 };
  const innerW = width - pad.l - pad.r, innerH = height - pad.t - pad.b;
  const prices = points.map(point => point.price), scores = points.map(point => point.score);
  const lo = Math.log10(Math.min(...prices)), hi = Math.log10(Math.max(...prices));
  const span = Math.max(hi - lo, 0.2);
  const x0 = lo - span * 0.06, x1 = hi + span * 0.12;
  const scoreMin = Math.min(...scores), scoreMax = Math.max(...scores);
  const y0 = scoreMin - Math.max(4, (scoreMax - scoreMin) * 0.12), y1 = scoreMax + Math.max(6, (scoreMax - scoreMin) * 0.16);
  const x = (price: number) => pad.l + (Math.log10(price) - x0) / (x1 - x0) * innerW;
  const y = (score: number) => pad.t + (1 - (score - y0) / (y1 - y0)) * innerH;
  const frontier = paretoFrontier(points.map(point => ({ id: point.modelId, price: point.price, score: point.score })));
  const decade = (value: number) => { const power = Math.pow(10, Math.floor(Math.log10(value))); const step = power / 2; return Math.round(value / step) * step; };
  const xTicks: number[] = [];
  for (let value = decade(Math.pow(10, x0)); value <= Math.pow(10, x1) * 1.001; value *= 2) if (value >= Math.pow(10, x0) && value <= Math.pow(10, x1)) xTicks.push(value);
  const yTicks = Array.from({ length: 5 }, (_, index) => scoreMin + (scoreMax - scoreMin) * index / 4).map(value => Math.round(value));
  const colors = new Map<string, string>(catalog.providers.map(provider => [provider.id, provider.color]));
  const order = [...points].sort((a, b) => Number(frontier.has(b.modelId)) - Number(frontier.has(a.modelId)));
  // Labels never overlap: each frontier point tries a few offsets and takes the first slot that is free.
  const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
  const labelWidth = (text: string) => text.length * 6.6 + 4;
  const fits = (box: { x0: number; x1: number; y0: number; y1: number }) => !placed.some(other => box.x0 < other.x1 && box.x1 > other.x0 && box.y0 < other.y1 && box.y1 > other.y0);
  const dots = order.map(point => {
    const isFrontier = frontier.has(point.modelId);
    const cx = x(point.price), cy = y(point.score);
    const dot = `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${isFrontier ? 6 : 4.2}" fill="${colors.get(point.providerId) ?? '#86868b'}" fill-opacity="${isFrontier ? 1 : 0.62}"${isFrontier ? ' stroke="#1d1d1f" stroke-width="1.4"' : ''}><title>${escapeHtml(point.name)}${point.mode ? ` · ${escapeHtml(point.mode)}` : ''} · ${priceLabel(point.price)} / 次 · ${point.score} 分</title></circle>`;
    if (!isFrontier) return dot;
    const text = point.name;
    const anchor = cx > width - 150 ? 'end' : 'start';
    const shift = anchor === 'end' ? -9 : 9;
    const boxW = labelWidth(text);
    const candidates = [-9, 17, -23, 31, -37, 45];
    let dy = candidates[0];
    for (const candidate of candidates) {
      const left = anchor === 'end' ? cx + shift - boxW : cx + shift;
      const box = { x0: left, x1: left + boxW, y0: cy + candidate - 10, y1: cy + candidate + 3 };
      if (fits(box)) { dy = candidate; placed.push(box); break; }
    }
    return `${dot}<text x="${(cx + shift).toFixed(1)}" y="${(cy + dy).toFixed(1)}" text-anchor="${anchor}" class="scatter-label">${escapeHtml(text)}</text>`;
  }).join('');
  const frontierPoints = [...points].filter(point => frontier.has(point.modelId)).sort((a, b) => a.price - b.price);
  const line = frontierPoints.length > 1 ? `<polyline class="scatter-frontier" points="${frontierPoints.map(point => `${x(point.price).toFixed(1)},${y(point.score).toFixed(1)}`).join(' ')}" fill="none" />` : '';
  return `<figure class="scatter-figure"><figcaption>${escapeHtml(label)}：越靠左上越划算。虚线连接帕累托前沿 —— 同价位没有更高分、同分数没有更低价。</figcaption>
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(label)}模型价格与性能散点图，共 ${points.length} 个模型">
      ${yTicks.map(tick => `<line x1="${pad.l}" x2="${width - pad.r}" y1="${y(tick).toFixed(1)}" y2="${y(tick).toFixed(1)}" class="scatter-grid" /><text x="${pad.l - 10}" y="${(y(tick) + 4).toFixed(1)}" text-anchor="end" class="scatter-tick">${tick}</text>`).join('')}
      ${xTicks.map(tick => `<line x1="${x(tick).toFixed(1)}" x2="${x(tick).toFixed(1)}" y1="${pad.t}" y2="${height - pad.b}" class="scatter-grid" /><text x="${x(tick).toFixed(1)}" y="${height - pad.b + 18}" text-anchor="middle" class="scatter-tick">${priceLabel(tick)}</text>`).join('')}
      <line x1="${pad.l}" x2="${width - pad.r}" y1="${height - pad.b}" y2="${height - pad.b}" class="scatter-axis" />
      <line x1="${pad.l}" x2="${pad.l}" y1="${pad.t}" y2="${height - pad.b}" class="scatter-axis" />
      ${line}${dots}
      <text x="${width - pad.r}" y="${height - 6}" text-anchor="end" class="scatter-axis-label">单次任务成本（日常聊天 1K 输入 / 1K 输出，对数刻度）</text>
      <text x="${pad.l - 44}" y="${pad.t + 10}" class="scatter-axis-label">Arena 分</text>
    </svg></figure>`;
}

/** Frontier rows for the table under the chart. */
export function frontierRows(points: ValuePoint[], catalog: Catalog) {
  const frontier = paretoFrontier(points.map(point => ({ id: point.modelId, price: point.price, score: point.score })));
  return points.filter(point => frontier.has(point.modelId)).sort((a, b) => a.price - b.price).map(point => ({
    ...point, provider: catalog.providers.find(provider => provider.id === point.providerId)!,
  }));
}
