import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureCatalog as catalog } from './fixtures/catalog';
import { catalogSchema } from '../src/lib/schema';
import { historySchema } from '../src/lib/pricing-metadata';
import { defaultFilters, getRows, type Filters } from '../src/lib/ranking';
import { cheaperAlternatives, monthlyCost, monthlyRanking, paretoFrontier, recentAdditions, recentPriceChanges } from '../src/lib/insights';
import { MAX_COMPARE, compareHref, parseCompareIds, renderCompare } from '../src/lib/compare';
import { frontierRows, renderScatter, valueBoard } from '../src/lib/value';
import { migrationTable, renderMigrationBody } from '../src/lib/migration';
import { catalog as realCatalog } from '../src/lib/catalog';
import { performanceBoards } from '../src/lib/performance-data';

const filters = (patch: Partial<Filters> = {}): Filters => ({ ...defaultFilters, providers: [], ...patch });
const model = (id: string) => catalog.models.find(item => item.id === id)!;
const officialUrl = (id: string) => catalog.sources.find(source => source.id === model(id).sourceId)!.url;
const eventsFor = () => historySchema.parse({
  schemaVersion: 1,
  models: [
    { modelId: 'qwen-flash', providerId: 'alibaba', events: [
      { id: 'a', detectedAt: '2026-08-01T00:00:00.000Z', effectiveAt: null, currency: 'CNY', rates: model('qwen-flash').rates, sourceUrl: officialUrl('qwen-flash'), reason: 'initial_snapshot', verification: 'manual_verified', changeTypes: [] },
      { id: 'b', detectedAt: '2026-09-20T00:00:00.000Z', effectiveAt: '2026-09-22T00:00:00.000Z', currency: 'CNY', rates: model('qwen-flash').rates.map(rate => ({ ...rate, input: rate.input * 2 })), sourceUrl: officialUrl('qwen-flash'), reason: 'price_change', verification: 'manual_verified', changeTypes: ['input'] },
    ] },
    { modelId: 'gpt-5-6-luna', providerId: 'openai', events: [
      { id: 'c', detectedAt: '2026-10-30T00:00:00.000Z', effectiveAt: null, currency: 'USD', rates: model('gpt-5-6-luna').rates, sourceUrl: officialUrl('gpt-5-6-luna'), reason: 'initial_snapshot', verification: 'manual_verified', changeTypes: [] },
    ] },
  ],
});

test('最近上架取首次快照，最新在前', () => {
  const additions = recentAdditions(catalog, eventsFor());
  assert.equal(additions[0].model.id, 'gpt-5-6-luna');
  assert.equal(additions[1].model.id, 'qwen-flash');
});
test('调价记录给出涨跌幅与字段', () => {
  const changes = recentPriceChanges(catalog, eventsFor(), 6, 3650, Date.parse('2026-11-12T00:00:00Z'));
  assert.equal(changes.length, 1);
  assert.equal(changes[0].model.id, 'qwen-flash');
  assert.equal(changes[0].direction, 'up');
  assert.equal(Math.round(changes[0].percent!), 100);
  assert.match(changes[0].label, /输入/);
});
test('月账单按单次成本线性放大并排序', () => {
  assert.equal(monthlyCost(0.5, 100, 30), 1500);
  const board = monthlyRanking([{ task: 2, model: model('qwen-flash') } as never, { task: 1, model: model('gpt-5-6-luna') } as never], 10, 30);
  assert.equal(board[0].monthly, 300);
  assert.equal(board[1].monthly, 600);
});
test('帕累托前沿排除被同时压制（更贵且更低分）的点', () => {
  const frontier = paretoFrontier([
    { id: 'cheap', price: 1, score: 10 },
    { id: 'mid', price: 2, score: 20 },
    { id: 'dominated', price: 3, score: 15 },
    { id: 'best', price: 4, score: 30 },
  ]);
  assert.deepEqual([...frontier].sort(), ['best', 'cheap', 'mid']);
});
test('更便宜的替代模型只落在同场景且确实更省', () => {
  const alternatives = cheaperAlternatives(model('gpt-5-6-luna'), catalog, filters(), undefined, 5);
  assert.ok(alternatives.length > 0);
  for (const item of alternatives) assert.ok(item.savings > 0 && item.savings < 1);
});
test('对比链接可往返，且最多四人', () => {
  const href = compareHref('/', ['qwen-flash', 'gpt-5-6-luna'], filters({ billing: 'cache' }));
  const query = new URL(href, 'https://example.com').searchParams.get('ids')!;
  assert.deepEqual(parseCompareIds(`?ids=${query}`, catalog).slice(0, 2), ['qwen-flash', 'gpt-5-6-luna']);
  assert.equal(parseCompareIds('?ids=qwen-flash,gpt-5-6-luna,qwen-plus,glm-4-7,gpt-6-astra', realCatalog).length, MAX_COMPARE);
});
test('对比表标出最优列并渲染条目', () => {
  const html = renderCompare([model('qwen-flash'), model('gpt-5-6-luna')], catalog, filters(), '/', '2026-11-12');
  assert.match(html, /compare-table/);
  assert.match(html, /compare-best/);
  assert.match(html, /Qwen Flash/);
});
test('性价比图只收有分数的模型，并画出帕累托虚线', () => {
  const board = valueBoard(catalog, filters(), 'text', '2026-11-12');
  assert.ok(board.points.length > 0);
  assert.equal(board.points.some(point => !Number.isFinite(point.score)), false);
  const svg = renderScatter(board.points, catalog, 'text');
  assert.match(svg, /scatter-figure/);
  assert.ok(frontierRows(board.points, catalog).length >= 1);
});
test('真实数据下三个分类都能映射出至少 10 款模型', () => {
  for (const category of ['text', 'code', 'vision'] as const) {
    const board = valueBoard(realCatalog, defaultFilters, category, '2026-11-12');
    assert.ok(board.listed > 0, category);
    assert.ok(board.points.length >= 10, category);
  }
  void performanceBoards;
});
test('迁移计算器给出当前月账单与更省的替代', () => {
  const result = migrationTable(model('gpt-5-6-luna'), catalog, filters(), 1000);
  assert.ok(result.self);
  assert.ok(result.monthly > 0);
  const cheaper = result.rows.filter(row => row.savings > 0);
  assert.ok(cheaper.length > 0);
  assert.ok(cheaper.every(row => row.monthly < result.monthly));
});
test('迁移计算器渲染出四列表格，且账单条按当前成本归一', () => {
  const target = model('gpt-5-6-luna');
  const result = migrationTable(target, catalog, filters(), 1000);
  const html = renderMigrationBody(result, target, '/yuanbao-model-rankings/');
  assert.match(html, /替代模型/);
  assert.match(html, /每月账单/);
  assert.match(html, /migration-bar/);
  const widths = [...html.matchAll(/width:([\d.]+)%/g)].map(match => Number(match[1]));
  assert.ok(widths.length > 0);
  assert.ok(widths.every(width => width > 0 && width <= 100), widths.join(','));
});
test('迁移计算器在超出上下文时返回空结果而不是 0 成本', () => {
  const result = migrationTable(model('gpt-5-6-luna'), catalog, filters({ inputTokens: 9_000_000 }), 1000);
  assert.equal(result.self, null);
  assert.equal(result.rows.length, 0);
});
test('汇率参数会改变人民币报价', () => {
  const base = getRows(catalog, filters(), '2026-11-12').rows.find(row => row.model.id === 'gpt-5-6-luna')!;
  const higher = getRows(catalog, filters({ fx: 8 }), '2026-11-12').rows.find(row => row.model.id === 'gpt-5-6-luna')!;
  assert.ok(higher.input > base.input);
});
void catalogSchema;
