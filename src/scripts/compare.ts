import { catalog } from '../lib/catalog';
import { defaultFilters, getRows, money, type Filters } from '../lib/ranking';
import { modelSearch } from '../lib/search';
import { parseFilters } from '../lib/url-state';
import { escapeHtml, mark } from '../lib/render';
import { MAX_COMPARE, parseCompareIds, renderCompare } from '../lib/compare';

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const base = byId('main').dataset.base!;
const searchInput = byId<HTMLInputElement>('compare-search');
const root = byId('compare-root');
const panel = byId('compare-panel');
const empty = byId('compare-empty');
const suggestions = byId('compare-suggestions');
let filters = parseFilters(location.search);
let ids = parseCompareIds(location.search, catalog);
let toastTimer: ReturnType<typeof setTimeout>;

function toast(message: string) {
  clearTimeout(toastTimer);
  byId('toast').textContent = message;
  byId('toast').hidden = false;
  toastTimer = setTimeout(() => { byId('toast').hidden = true; }, 3000);
}
function writeUrl(push = false) {
  const p = new URLSearchParams(location.search);
  if (ids.length) p.set('ids', ids.join(',')); else p.delete('ids');
  const url = `${location.pathname}${p.size ? `?${p}` : ''}`;
  if (url !== `${location.pathname}${location.search}`) history[push ? 'pushState' : 'replaceState'](null, '', url);
}
function renderSuggestions() {
  const query = searchInput.value.trim();
  const matches = modelSearch(query);
  const pool = getRows(catalog, { ...filters, query: '', providers: [], status: 'available' as const, maxPrice: null, minContext: 0, region: 'all', useCase: 'all' }).rows;
  const list = pool
    .filter(row => !ids.includes(row.model.id) && matches(row.model.name, row.model.apiId, catalog.providers.find(p => p.id === row.model.providerId)!.shortName))
    .sort((a, b) => (query ? 0 : a.input - b.input) || a.model.name.localeCompare(b.model.name))
    .slice(0, query ? 8 : 5);
  suggestions.innerHTML = list.map(row => `<button type="button" class="compare-suggestion" role="option" aria-selected="false" data-add="${escapeHtml(row.model.id)}">${mark(catalog, row.model.providerId, base)}<span class="compare-suggestion-name">${escapeHtml(row.model.name)}</span><span class="compare-suggestion-price">¥${money(row.input)}</span><span class="compare-add" aria-hidden="true">＋</span></button>`).join('')
    || `<p class="compare-empty-hint">${query ? '没有匹配的模型' : '排行榜当前没有可选模型'}</p>`;
}
function render() {
  ids = ids.filter(id => catalog.models.some(model => model.id === id));
  const models = ids.map(id => catalog.models.find(model => model.id === id)!);
  panel.hidden = models.length === 0;
  empty.hidden = models.length > 0;
  byId('compare-count').textContent = String(models.length);
  root.innerHTML = models.length ? renderCompare(models, catalog, filters, base) : '';
  byId('compare-hint').textContent = models.length >= MAX_COMPARE
    ? `已达上限（${MAX_COMPARE} 款）。移除一款后可继续添加。`
    : '从排行榜或本页搜索加入模型，对比结果会写进链接，可直接分享。';
  renderSuggestions();
}
function add(id: string) {
  if (ids.includes(id)) { toast('这款模型已经在对比里了'); return; }
  if (ids.length >= MAX_COMPARE) { toast(`最多同时对比 ${MAX_COMPARE} 款模型`); return; }
  ids = [...ids, id];
  searchInput.value = '';
  writeUrl(true);
  render();
  toast(`已加入 ${catalog.models.find(model => model.id === id)?.name ?? id}`);
}
searchInput.addEventListener('input', renderSuggestions);
suggestions.addEventListener('click', event => {
  const button = (event.target as Element).closest<HTMLButtonElement>('[data-add]');
  if (button) add(button.dataset.add!);
});
root.addEventListener('click', event => {
  const button = (event.target as Element).closest<HTMLButtonElement>('[data-remove]');
  if (!button) return;
  ids = ids.filter(id => id !== button.dataset.remove);
  writeUrl(true);
  render();
});
byId('compare-share').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(location.href); toast('对比链接已复制，包含所选模型与计费设置'); }
  catch { toast('复制失败，请手动复制地址栏链接'); }
});
window.addEventListener('popstate', () => {
  filters = parseFilters(location.search);
  ids = parseCompareIds(location.search, catalog);
  render();
});
render();
