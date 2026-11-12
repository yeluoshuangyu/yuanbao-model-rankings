import { catalog } from '../../src/lib/catalog.ts';
import { defaultFilters, getRows } from '../../src/lib/ranking.ts';
const { rows, unavailable } = getRows(catalog, defaultFilters);
const shown = new Set(rows.map(r => r.model.id));
const miss = catalog.models.filter(m => !shown.has(m.id));
console.log('total', catalog.models.length, 'shown', rows.length, 'unavailable', unavailable, 'missing', miss.length);
for (const m of miss) console.log(' -', m.id, '| status=' + m.status, '| ver=' + (m.verification?.status), '| ctx=' + m.contextTokens, '| maxOut=' + m.maxOutputTokens, '| rates=' + m.rates.map(r => `${r.upToInputTokens}:${r.input}/${r.output}`).join(','));
