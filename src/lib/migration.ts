import type { Catalog, Model } from './schema';
import { money, quote, scenarios, type Filters } from './ranking';
import { escapeHtml } from './render';

export interface MigrationRow { model: Model; perCall: number; monthly: number; savings: number; applied: string }
export interface MigrationResult { self: MigrationRow | null; rows: MigrationRow[]; monthly: number }

/** Same workload, same billing mode, every comparable model — sorted by monthly bill. */
export function migrationTable(model: Model, catalog: Catalog, filters: Filters, daily: number, days = 30, today?: string): MigrationResult {
  const fx = filters.fx ?? catalog.meta.usdToCny;
  const priced = (candidate: Model) => quote(candidate, { ...filters, fx }, fx, today);
  const own = priced(model);
  const self = own ? { model, perCall: own.task, monthly: own.task * daily * days, savings: 0, applied: own.applied } : null;
  if (!own || !self) return { self: null, rows: [], monthly: 0 };
  const rows: MigrationRow[] = [];
  for (const candidate of catalog.models) {
    if (candidate.id === model.id || candidate.status === 'retired' || candidate.verification?.status === 'unknown') continue;
    if (!candidate.useCases.some(useCase => model.useCases.includes(useCase))) continue;
    const price = priced(candidate);
    if (!price || price.task <= 0) continue;
    rows.push({ model: candidate, perCall: price.task, monthly: price.task * daily * days, savings: 1 - price.task / own.task, applied: price.applied });
  }
  // Cheapest first, but keep a couple of pricier-but-better options visible for context.
  rows.sort((a, b) => a.monthly - b.monthly || a.model.id.localeCompare(b.model.id));
  const cheaper = rows.filter(row => row.savings > 0.02).slice(0, 4);
  const dearer = rows.filter(row => row.savings <= 0).slice(0, 1);
  return { self, rows: [...cheaper, ...dearer], monthly: self.monthly };
}

const scenarioName = (filters: Filters) => filters.scenario === 'custom' ? '自定义' : scenarios[filters.scenario].name;
export const migrationSummary = (result: MigrationResult, filters: Filters) =>
  `${money(result.monthly, true)} / 月 · 单次 ¥${money(result.self?.perCall ?? 0, true)} · ${scenarioName(filters)}用量`;

/** Client-side markup for the migration panel: one implementation shared by the page and the tests. */
export function renderMigrationBody(result: MigrationResult, model: Model, base: string): string {
  if (!result.self) return '<p class="muted">当前用量超出该模型的费率范围，先调整上面的 Token 数。</p>';
  const rows = result.rows.map(row => {
    const share = result.monthly > 0 ? Math.max(3, Math.min(100, row.monthly / result.monthly * 100)) : 100;
    const tag = row.savings > 0
      ? `<span class="saving-tag">省 ${(row.savings * 100).toFixed(0)}%</span>`
      : `<span class="dearer-tag">贵 ${Math.abs(row.savings * 100).toFixed(0)}%</span>`;
    return `<tr><th scope="row"><a href="${base}models/${row.model.id}/">${escapeHtml(row.model.name)}</a><span class="migration-bar" aria-hidden="true"><i style="width:${share.toFixed(1)}%"></i></span></th><td class="numeric">¥${money(row.perCall, true)}</td><td class="numeric"><strong>¥${money(row.monthly, true)}</strong></td><td>${tag}</td></tr>`;
  }).join('');
  return `<p class="migration-self">当前：<strong>${escapeHtml(model.name)}</strong> ¥${money(result.monthly, true)} / 月（单次 ¥${money(result.self.perCall, true)}）</p><div class="table-scroll" tabindex="0" role="region" aria-label="替代模型月成本对比"><table class="migration-table"><thead><tr><th scope="col">替代模型</th><th scope="col" class="numeric">单次成本</th><th scope="col" class="numeric">每月账单</th><th scope="col">对比</th></tr></thead><tbody>${rows || '<tr><td colspan="4">暂时没有更便宜的同类模型。</td></tr>'}</tbody></table></div>`;
}
