import { catalog } from '../lib/catalog';
import { monthlyRanking } from '../lib/insights';
import { money, type Filters, type Row } from '../lib/ranking';
import { modelUrl, mark, escapeHtml } from '../lib/render';

/** Monthly bill for the current filters, with the spread between cheapest and priciest. */
export function renderMonthly(rows: Row[], filters: Filters, base: string, daily: number, days: number): string {
  if (!rows.length) return '<p class="monthly-empty">当前筛选下没有可用模型。</p>';
  const ranked = monthlyRanking(rows, daily, days).filter(item => item.monthly > 0);
  if (!ranked.length) return '<p class="monthly-empty">当前任务用量下成本为 0，试试增加 Token 或调用次数。</p>';
  const cheapest = ranked[0];
  const priciest = ranked.at(-1)!;
  const top = ranked.slice(0, 6);
  const ceiling = top.at(-1)!.monthly || 1;
  const calls = (daily * days).toLocaleString('zh-CN');
  const items = top.map((item, index) => {
    const width = Math.max(4, (item.monthly / ceiling) * 100);
    return `<li><span class="monthly-rank">${String(index + 1).padStart(2, '0')}</span><a class="monthly-model" href="${modelUrl(base, item.row.model.id, filters)}">${mark(catalog, item.row.model.providerId, base)}<span>${escapeHtml(item.row.model.name)}</span></a><span class="monthly-track" aria-hidden="true"><i style="width:${width.toFixed(1)}%"></i></span><strong class="monthly-amount">¥${money(item.monthly, true)}</strong></li>`;
  }).join('');
  const spread = priciest.monthly / cheapest.monthly;
  const delta = priciest.monthly - cheapest.monthly;
  return `<p class="monthly-summary">${calls} 次调用 · 最省 <strong>${escapeHtml(cheapest.row.model.name)}</strong> ¥${money(cheapest.monthly, true)} / 月${ranked.length > 1 ? `；同样用量下最贵的是 ${escapeHtml(priciest.row.model.name)}，¥${money(priciest.monthly, true)} / 月，相差 ${spread.toFixed(1)} 倍（每月多花 ¥${money(delta, true)}）` : ''}。</p><ol class="monthly-list">${items}</ol>`;
}
