import type { Catalog, Model } from './schema';
import type { PriceHistory } from './pricing-metadata';
import { quote, type Filters, type Row } from './ranking';

export interface RecentAddition { model: Model; at: string }

/** Newest models, judged by the first snapshot we ever recorded for them. */
export function recentAdditions(catalog: Catalog, history: PriceHistory, limit = 6): RecentAddition[] {
  const models = new Map(catalog.models.map(model => [model.id, model]));
  const items: RecentAddition[] = [];
  for (const entry of history.models) {
    const model = models.get(entry.modelId);
    const first = entry.events[0];
    if (!model || first?.reason !== 'initial_snapshot') continue;
    if (model.status === 'retired' || model.verification?.status === 'unknown') continue;
    items.push({ model, at: first.detectedAt });
  }
  return items.sort((a, b) => b.at.localeCompare(a.at) || a.model.id.localeCompare(b.model.id)).slice(0, limit);
}

export type ChangeDirection = 'up' | 'down' | 'adjust';
export interface RecentChange {
  model: Model; at: string; effectiveAt: string | null; currency: 'USD' | 'CNY';
  label: string; percent: number | null; direction: ChangeDirection;
}

const symbolOf = (currency: string) => currency === 'CNY' ? '¥' : '$';
const amount = (value: number, currency: string) => {
  const digits = value >= 1 ? 2 : value >= .01 ? 3 : 5;
  return `${symbolOf(currency)}${value.toFixed(digits).replace(/0+$/, '').replace(/\.$/, '')}`;
};
const compact = (value: number) => value >= 1_000_000 ? `${+(value / 1_000_000).toFixed(2)}M` : value >= 1000 ? `${+(value / 1000).toFixed(0)}K` : String(value);

/** Latest verified change per model, described in one line (price, tier bound or context). */
export function recentPriceChanges(catalog: Catalog, history: PriceHistory, limit = 6, days = 180, now = Date.now()): RecentChange[] {
  const models = new Map(catalog.models.map(model => [model.id, model]));
  const cutoff = now - days * 86_400_000;
  const items: RecentChange[] = [];
  for (const entry of history.models) {
    const model = models.get(entry.modelId);
    const latest = entry.events.at(-1);
    const previous = entry.events.at(-2);
    if (!model || !latest || !previous) continue;
    if (model.verification?.status === 'unknown' || model.status === 'retired') continue;
    if (latest.reason !== 'price_change' || latest.currency !== previous.currency) continue;
    if (Date.parse(latest.detectedAt) < cutoff) continue;
    const currency = latest.currency;
    const moves = (['input', 'output', 'cacheRead'] as const).flatMap(field => latest.rates.map((rate, index) => {
      const before = previous.rates[index]?.[field];
      if (before === null || before === undefined || rate[field] === null) return null;
      if (before === rate[field]) return null;
      const percent = before === 0 ? null : (rate[field]! - before) / before * 100;
      return { field, tier: index, from: before, to: rate[field]!, percent };
    }).filter(Boolean)).sort((a, b) => Math.abs(b!.percent ?? 100) - Math.abs(a!.percent ?? 100));
    const moved = moves[0];
    if (moved) {
      const name = moved.field === 'input' ? '输入' : moved.field === 'output' ? '输出' : '缓存读取';
      items.push({
        model, at: latest.detectedAt, effectiveAt: latest.effectiveAt, currency,
        label: `${name} ${amount(moved.from, currency)} → ${amount(moved.to, currency)}`,
        percent: moved.percent,
        direction: (moved.percent ?? 0) < 0 ? 'down' : 'up',
      });
      continue;
    }
    const boundIndex = latest.rates.findIndex((rate, index) => previous.rates[index] && previous.rates[index].upToInputTokens !== rate.upToInputTokens);
    if (boundIndex >= 0) {
      items.push({ model, at: latest.detectedAt, effectiveAt: latest.effectiveAt, currency,
        label: `第 ${boundIndex + 1} 档上限 ${compact(previous.rates[boundIndex].upToInputTokens)} → ${compact(latest.rates[boundIndex].upToInputTokens)}`,
        percent: null, direction: 'adjust' });
      continue;
    }
    const beforeContext = previous.rates.at(-1)!.upToInputTokens as number;
    const contextMove = previous.rates.length === latest.rates.length && beforeContext !== latest.rates.at(-1)!.upToInputTokens;
    if (contextMove) {
      items.push({ model, at: latest.detectedAt, effectiveAt: latest.effectiveAt, currency,
        label: `可用输入 ${compact(beforeContext)} → ${compact(latest.rates.at(-1)!.upToInputTokens)}`, percent: null, direction: 'adjust' });
      continue;
    }
    if (previous.rates.length !== latest.rates.length) {
      items.push({ model, at: latest.detectedAt, effectiveAt: latest.effectiveAt, currency,
        label: `阶梯由 ${previous.rates.length} 档调整为 ${latest.rates.length} 档`, percent: null, direction: 'adjust' });
    }
  }
  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

/** Monthly bill from the per-request task cost. */
export const monthlyCost = (task: number, dailyRequests: number, days = 30) => task * dailyRequests * days;

export interface MonthlyRow { row: Row; monthly: number }
export function monthlyRanking(rows: Row[], dailyRequests: number, days = 30): MonthlyRow[] {
  return rows.map(row => ({ row, monthly: monthlyCost(row.task, dailyRequests, days) })).sort((a, b) => a.monthly - b.monthly || a.row.model.id.localeCompare(b.row.model.id));
}

export interface ValueInput { id: string; price: number; score: number }
/** Models nobody beats on both axes: cheapest for their score band. */
export function paretoFrontier(points: ValueInput[]): Set<string> {
  const frontier = new Set<string>();
  let best = -Infinity;
  for (const point of [...points].sort((a, b) => a.price - b.price || b.score - a.score)) {
    if (point.score > best) { frontier.add(point.id); best = point.score; }
  }
  return frontier;
}

export interface Alternative { model: Model; other: number; savings: number }
/** Cheaper models for the same job under the current token mix. */
export function cheaperAlternatives(model: Model, catalog: Catalog, filters: Filters, today?: string, limit = 4): Alternative[] {
  const own = quote(model, filters, catalog.meta.usdToCny, today);
  if (!own || own.task <= 0) return [];
  const fx = filters.fx ?? catalog.meta.usdToCny;
  const items: Alternative[] = [];
  for (const candidate of catalog.models) {
    if (candidate.id === model.id || candidate.status === 'retired' || candidate.verification?.status === 'unknown') continue;
    if (!candidate.useCases.some(useCase => model.useCases.includes(useCase))) continue;
    const other = quote(candidate, { ...filters, fx }, fx, today);
    if (!other || other.task <= 0 || other.task >= own.task) continue;
    items.push({ model: candidate, other: other.task, savings: 1 - other.task / own.task });
  }
  return items.sort((a, b) => a.other - b.other || a.model.id.localeCompare(b.model.id)).slice(0, limit);
}
