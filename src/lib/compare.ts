import type { Catalog, Model } from './schema';
import { billingLabels, money, quote, scenarios, statusLabels, tokens, type Filters } from './ranking';
import { escapeHtml, mark, modelUrl, pathFor } from './render';

export const MAX_COMPARE = 4;

export function parseCompareIds(search: string, catalog: Catalog): string[] {
  const raw = new URLSearchParams(search).get('ids') ?? '';
  const known = new Set(catalog.models.map(model => model.id));
  return [...new Set(raw.split(',').map(id => id.trim()).filter(id => known.has(id)))].slice(0, MAX_COMPARE);
}
/** Compare links carry only the settings that change the numbers. */
export function compareHref(base: string, ids: string[], filters?: Filters): string {
  const p = new URLSearchParams();
  if (ids.length) p.set('ids', ids.join(','));
  if (filters) {
    if (filters.fx !== null) p.set('fx', String(filters.fx));
    if (filters.billing !== 'standard') p.set('billing', filters.billing);
    if (filters.cachePercent !== 50) p.set('hit', String(filters.cachePercent));
    if (filters.scenario === 'custom') { p.set('scenario', 'custom'); p.set('in', String(filters.inputTokens)); p.set('out', String(filters.outputTokens)); }
  }
  const query = p.toString();
  return `${pathFor(base, 'compare/')}${query ? `?${query}` : ''}`;
}

interface Metric { label: string; help?: string; values: (string | null)[]; numbers?: (number | null)[]; best: 'min' | 'max' | 'none'; bar?: boolean }

function scenarioCosts(model: Model, filters: Filters, usdToCny: number) {
  return (['chat', 'long', 'code'] as const).map(scenario => {
    const prices = quote(model, { ...filters, scenario, inputTokens: scenarios[scenario].input, outputTokens: scenarios[scenario].output, fx: usdToCny }, usdToCny);
    return { scenario, task: prices?.task ?? null };
  });
}

/** Side-by-side comparison table: one column per model, best value highlighted per row. */
export function renderCompare(models: Model[], catalog: Catalog, filters: Filters, base: string, today?: string): string {
  const usdToCny = filters.fx ?? catalog.meta.usdToCny;
  const quotes = models.map(model => quote(model, { ...filters, fx: usdToCny }, usdToCny, today));
  const price = (index: number, field: 'input' | 'output' | 'cache' | 'task') => {
    const value = quotes[index] ? quotes[index]![field] : null;
    return value === null ? null : { text: `¥${money(value, field === 'task')}`, number: value };
  };
  const priceMetric = (label: string, field: 'input' | 'output' | 'cache' | 'task', help?: string): Metric => {
    const cells = models.map((_, index) => price(index, field));
    return { label, help, values: cells.map(cell => cell?.text ?? '—'), numbers: cells.map(cell => cell?.number ?? null), best: 'min', bar: field === 'task' };
  };
  const costs = models.map(model => scenarioCosts(model, filters, usdToCny));
  const metrics: Metric[] = [
    priceMetric(`输入价格（${billingLabels[filters.billing]}）`, 'input', `当前请求 ${filters.inputTokens.toLocaleString('zh-CN')} Token 所适用的阶梯，人民币每百万 Token`),
    priceMetric('输出价格', 'output', '同一阶梯下的人民币每百万 Token'),
    priceMetric('缓存读取', 'cache', '命中缓存的输入读取价，不含写入与存储'),
    priceMetric(`任务成本（${filters.metric === 'task' ? '当前任务' : '按当前 Token 数'}）`, 'task', `${filters.inputTokens.toLocaleString('zh-CN')} 输入 + ${filters.outputTokens.toLocaleString('zh-CN')} 输出`),
    ...(['chat', 'long', 'code'] as const).map((scenario, index) => ({
      label: `${scenarios[scenario].name}单次成本`, help: `${scenarios[scenario].input.toLocaleString('zh-CN')} 输入 + ${scenarios[scenario].output.toLocaleString('zh-CN')} 输出，标准费率`,
      values: costs.map(list => list[index].task === null ? '超出上限' : `¥${money(list[index].task!, true)}`),
      numbers: costs.map(list => list[index].task), best: 'min' as const, bar: true,
    })),
    { label: '上下文窗口', values: models.map(model => tokens(model.contextTokens)), numbers: models.map(model => model.contextTokens), best: 'max' },
    { label: '最大输出', values: models.map(model => tokens(model.maxOutputTokens)), numbers: models.map(model => model.maxOutputTokens), best: 'max' },
    { label: '阶梯档位', values: models.map(model => `${model.rates.length} 档 · 至 ${tokens(model.rates.at(-1)!.upToInputTokens)}`), best: 'none' },
    { label: 'Batch 折扣', values: models.map(model => model.rates[0].batchFactor === null ? '未收录' : `${model.rates[0].batchFactor * 10} 折`), numbers: models.map(model => model.rates[0].batchFactor), best: 'min' },
    { label: '低峰折扣', values: models.map(model => model.rates[0].offPeakFactor === null ? '未收录' : `${model.rates[0].offPeakFactor * 10} 折`), numbers: models.map(model => model.rates[0].offPeakFactor), best: 'min' },
    { label: '状态', values: models.map(model => statusLabels[model.status]), best: 'none' },
    { label: '最后核验', values: models.map(model => `<time datetime="${escapeHtml(model.verification?.lastSuccessAt ?? model.verifiedAt)}">${escapeHtml((model.verification?.lastSuccessAt ?? model.verifiedAt).slice(0, 10))}</time>`), best: 'none' },
  ];
  const bestIndex = (metric: Metric, index: number) => {
    if (metric.best === 'none' || !metric.numbers) return false;
    const values = metric.numbers.filter((value): value is number => value !== null && Number.isFinite(value));
    if (values.length < 2) return false;
    const target = metric.best === 'min' ? Math.min(...values) : Math.max(...values);
    return metric.numbers[index] === target;
  };
  const head = models.map((model, index) => {
    const provider = catalog.providers.find(p => p.id === model.providerId)!;
    return `<th scope="col" data-model-id="${escapeHtml(model.id)}"><div class="compare-head">${mark(catalog, model.providerId, base)}<a href="${modelUrl(base, model.id)}">${escapeHtml(model.name)}</a><button type="button" class="compare-remove" data-remove="${escapeHtml(model.id)}" aria-label="移除 ${escapeHtml(model.name)}">×</button></div><span class="compare-provider">${escapeHtml(provider.shortName)} · ${escapeHtml(model.regionLabel)}</span>${model.status !== 'active' ? `<span class="status-tag ${model.status}">${statusLabels[model.status]}</span>` : ''}</th>`;
  }).join('');
  const body = metrics.map(metric => {
    const label = metric.help ? `<abbr title="${escapeHtml(metric.help)}">${escapeHtml(metric.label)}</abbr>` : escapeHtml(metric.label);
    const cells = models.map((_, index) => {
      const numeric = metric.numbers?.[index] ?? null;
      const bar = metric.bar && numeric !== null && numeric > 0;
      const ceiling = metric.bar ? Math.max(...(metric.numbers ?? []).filter((value): value is number => value !== null && value > 0)) : 0;
      const width = bar && ceiling > 0 ? Math.max(3, Math.round(numeric! / ceiling * 100)) : 0;
      return `<td class="numeric${bestIndex(metric, index) ? ' compare-best' : ''}">${bar ? `<span class="compare-meter" style="--bar:${width}%" aria-hidden="true"></span>` : ''}<span class="compare-value">${metric.values[index] ?? '—'}</span>${bestIndex(metric, index) ? `<span class="best-badge">${metric.best === 'max' ? '最大' : '最低'}</span>` : ''}</td>`;
    }).join('');
    return `<tr><th scope="row">${label}</th>${cells}</tr>`;
  }).join('');
  return `<table class="compare-table"><caption class="sr-only">模型并排对比</caption><thead><tr><th scope="col">对比项</th>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

/** Short label used in the floating compare bar. */
export function compareBarLabels(ids: string[], catalog: Catalog): string {
  return ids.map(id => catalog.models.find(model => model.id === id)?.name ?? id).join('、');
}
