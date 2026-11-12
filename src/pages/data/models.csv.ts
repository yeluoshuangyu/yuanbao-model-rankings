import { catalog } from '../../lib/catalog';
import { quote, scenarios, type Filters } from '../../lib/ranking';
import { defaultFilters } from '../../lib/ranking';

export const prerender = true;

const cell = (value: unknown) => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const chatFilters: Filters = { ...defaultFilters, scenario: 'chat', inputTokens: scenarios.chat.input, outputTokens: scenarios.chat.output };

/** Flat one-row-per-model export; tier detail stays in catalog.json. */
export function GET() {
  const header = ['id', 'name', 'api_id', 'provider_id', 'provider_name', 'status', 'region', 'currency', 'context_tokens', 'max_output_tokens',
    'input_price', 'output_price', 'cache_read_price', 'batch_factor', 'offpeak_factor', 'tiers', 'input_cny_per_mtok', 'output_cny_per_mtok', 'task_cost_cny_chat', 'source_url', 'verified_at', 'notes'];
  const rows = catalog.models.map(model => {
    const provider = catalog.providers.find(item => item.id === model.providerId)!;
    const source = catalog.sources.find(item => item.id === model.sourceId)!;
    const fx = model.currency === 'USD' ? catalog.meta.usdToCny : 1;
    const base = model.rates[0];
    const prices = quote(model, chatFilters, catalog.meta.usdToCny);
    return [model.id, model.name, model.apiId, model.providerId, provider.name, model.status, model.region, model.currency,
      model.contextTokens, model.maxOutputTokens, base.input, base.output, base.cacheRead, base.batchFactor, base.offPeakFactor, model.rates.length,
      +(base.input * fx).toFixed(6), +(base.output * fx).toFixed(6), prices ? +prices.task.toFixed(8) : '', source.url, model.verifiedAt,
      model.notes.join(' | ')].map(cell).join(',');
  });
  return new Response([header.join(','), ...rows].join('\n') + '\n', {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="yuanbao-model-prices.csv"' },
  });
}
