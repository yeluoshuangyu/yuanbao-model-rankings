import test from 'node:test';
import assert from 'node:assert/strict';
import { historySchema } from '../src/lib/pricing-metadata';
import { priceIndex, renderIndexChart } from '../src/lib/price-index';
import historyData from '../src/data/price-history.json';

const priceHistory = historySchema.parse(historyData);

const tier = (upToInputTokens: number, input: number, output: number) => ({ label: `输入不超过 ${upToInputTokens.toLocaleString('en-US')} Token`, upToInputTokens, input, output, cacheRead: null, batchFactor: null, offPeakFactor: null, promotion: null });
const snapshot = (input: number, output: number) => [tier(1_000_000, input, output)];

function build(eventsPerModel: { modelId: string; events: { date: string; rates: unknown; reason?: string }[] }[]) {
  return historySchema.parse({
    schemaVersion: 1,
    models: eventsPerModel.map(item => ({
      modelId: item.modelId,
      providerId: 'deepseek',
      events: item.events.map((event, index) => ({
        id: `${item.modelId}-${index}`,
        reason: event.reason ?? (index === 0 ? 'initial_snapshot' : 'price_change'),
        verification: 'manual_verified',
        changeTypes: index === 0 ? [] : ['input'],
        detectedAt: `${event.date}T00:00:00.000Z`,
        effectiveAt: null,
        currency: 'USD',
        sourceUrl: 'https://api-docs.deepseek.com/quick_start/pricing',
        rates: event.rates,
      })),
    })),
  });
}

test('单价真涨了，指数就涨', () => {
  const history = build([
    { modelId: 'deepseek-chat', events: [{ date: '2026-09-12', rates: snapshot(0.28, 0.42) }, { date: '2026-11-12', rates: snapshot(0.56, 0.42) }] },
  ]);
  const index = priceIndex(history);
  assert.equal(index.sample, 1);
  assert.deepEqual(index.points.map(point => point.index), [100, 200]);
  assert.equal(index.changes.length, 1);
  assert.equal(index.changes[0].direction, 'up');
});

test('只动档位上限不算涨价，指数保持 100', () => {
  const history = build([
    {
      modelId: 'deepseek-chat',
      events: [
        { date: '2026-09-12', rates: snapshot(0.28, 0.42) },
        { date: '2026-11-12', rates: [tier(512_000, 0.28, 0.42)] },
      ],
    },
  ]);
  const index = priceIndex(history);
  assert.equal(index.sample, 1);
  assert.deepEqual(index.points.map(point => point.index), [100, 100]);
  assert.equal(index.changes.length, 0);
});

test('从未变过的型号不进样本，避免把假平线稀释进指数', () => {
  const history = build([
    { modelId: 'deepseek-chat', events: [{ date: '2026-09-12', rates: snapshot(0.28, 0.42) }] },
    { modelId: 'deepseek-reasoner', events: [{ date: '2026-09-12', rates: snapshot(0.28, 0.42) }] },
  ]);
  const index = priceIndex(history);
  assert.equal(index.sample, 0);
  assert.equal(index.points.length, 0);
});

test('真实历史没有单价变化，指数是一条 100 的平线', () => {
  const index = priceIndex(priceHistory);
  assert.ok(index.sample >= 10);
  assert.ok(index.points.length >= 2);
  assert.ok(index.points.every(point => point.index === 100));
  const svg = renderIndexChart(index.points);
  assert.match(svg, /没有变化/);
  // 平线不该画刻度与基准虚线，否则唯一的刻度会读成"跌到 98"
  assert.doesNotMatch(svg, /chart-grid/);
});

test('有变化时画刻度与基准线', () => {
  const svg = renderIndexChart([{ date: '2026-09-12', index: 100, sample: 3 }, { date: '2026-11-12', index: 118, sample: 3 }]);
  assert.match(svg, /基准 100/);
  assert.doesNotMatch(svg, /没有变化/);
});
