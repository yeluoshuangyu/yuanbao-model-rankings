import { historySchema } from './pricing-metadata';

export type PriceHistory = ReturnType<typeof historySchema.parse>;

export type IndexPoint = { date: string; index: number; sample: number };
export type IndexChange = {
  modelId: string;
  date: string;
  reason: string;
  label: string;
  percent: number;
  direction: 'up' | 'down' | 'flat';
};
export type PriceIndex = {
  points: IndexPoint[];
  changes: IndexChange[];
  /** 参与指数计算的型号数：只统计真正发生过已核验变价的 */
  sample: number;
  observationDates: number;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * 全站价格变化指数。
 *
 * 口径必须说清楚，否则这条线会被读成全站价格水平：
 * - 只纳入**首发快照之后历史里出现过差异**的型号；从未有过第二条记录的 145 款没有可比对象，纳入只会稀释成假平线；
 * - 等权，不按调用量加权（我们没有调用量，加权就是编的）；
 * - 基准是各自首次快照 = 100，取首档输入价；
 * - 只在有事件的日期取值，中间不插值，所以是台阶而不是折线。
 *
 * 截至 2026-11-12 的实际结果是：161 款里有差异记录的 14 款，差异全部落在档位上限、档数、缓存或
 * Batch 折扣上，**首档输入价一条都没变**，所以指数恒等于 100。这不是画不出来，是真的没变过。
 */
export function priceIndex(history: PriceHistory): PriceIndex {
  const tracked: { modelId: string; first: number; events: { date: string; input: number; reason: string }[] }[] = [];

  for (const record of history.models) {
    const ordered = [...record.events].sort((a, b) => a.detectedAt.localeCompare(b.detectedAt));
    if (ordered.length < 2) continue;
    const first = ordered[0].rates[0]?.input ?? 0;
    if (first <= 0) continue;
    // 只要历史里出现过任何费率差异就纳入，而不是只看单价 —— 否则 14 款"档位/档数变了"的会被漏掉。
    const fingerprint = JSON.stringify(ordered[0].rates);
    if (!ordered.slice(1).some(event => JSON.stringify(event.rates) !== fingerprint)) continue;
    tracked.push({
      modelId: record.modelId,
      first,
      events: ordered.map(event => ({ date: event.detectedAt.slice(0, 10), input: event.rates[0]?.input ?? 0, reason: event.reason })),
    });
  }

  const dates = [...new Set(tracked.flatMap(item => item.events.map(event => event.date)))].sort();
  const points: IndexPoint[] = dates.map(date => {
    const values: number[] = [];
    for (const item of tracked) {
      // 该日期及之前最后一次已知价格；还没有记录的不纳入，避免用未来数据
      const known = item.events.filter(event => event.date <= date);
      if (!known.length) continue;
      values.push(known[known.length - 1].input / item.first);
    }
    return { date, index: values.length ? round2(values.reduce((a, b) => a + b, 0) / values.length * 100) : 100, sample: values.length };
  });

  const changes: IndexChange[] = [];
  for (const item of tracked) {
    for (let i = 1; i < item.events.length; i += 1) {
      const before = item.events[i - 1].input;
      const after = item.events[i].input;
      if (before === after) continue;
      const percent = before > 0 ? round2((after - before) / before * 100) : 0;
      changes.push({
        modelId: item.modelId,
        date: item.events[i].date,
        reason: item.events[i].reason,
        label: `${before} → ${after}`,
        percent,
        direction: after > before ? 'up' : 'down',
      });
    }
  }
  changes.sort((a, b) => b.date.localeCompare(a.date) || a.modelId.localeCompare(b.modelId));

  return { points, changes, sample: tracked.length, observationDates: dates.length };
}

/** 零依赖折线：只在观测日取值，用水平段连接（台阶），不插值。 */
export function renderIndexChart(points: IndexPoint[]): string {
  if (points.length < 2) {
    return `<p class="index-note">只有 ${points.length} 个观测日，画不出趋势。等下一次核验到新的变价再来看。</p>`;
  }
  const flat = points.every(point => point.index === points[0].index);
  const width = 640;
  // 全程没有变化时给一条扁带就够了，留 220 高会变成一大片空场
  const height = flat ? 116 : 220;
  const pad = { top: 18, right: 18, bottom: 30, left: 46 };
  const inner = { w: width - pad.left - pad.right, h: height - pad.top - pad.bottom };
  const values = points.map(point => point.index);
  const rawLow = Math.min(...values, 100);
  const rawHigh = Math.max(...values, 100);
  // 指数一直等于 100 时也要给线留出上下空间，否则会贴着坐标轴底边
  const margin = Math.max(2, (rawHigh - rawLow) * 0.15);
  const low = rawLow - margin;
  const high = rawHigh + margin;
  const span = high - low;
  const x = (i: number) => pad.left + (points.length === 1 ? inner.w / 2 : (i / (points.length - 1)) * inner.w);
  const y = (value: number) => pad.top + inner.h - ((value - low) / span) * inner.h;

  const segments: string[] = [];
  for (let i = 1; i < points.length; i += 1) {
    // 台阶：先横到当前日期，再竖到新值
    segments.push(`M${x(i - 1).toFixed(1)},${y(points[i - 1].index).toFixed(1)}H${x(i).toFixed(1)}V${y(points[i].index).toFixed(1)}`);
  }
  // 全程无变化时不画刻度线：那时唯一的刻度只会把人误导到"98"这种虚构值上
  const gridValues = flat ? [] : [low, (low + high) / 2, high].map(round2);
  const grid = gridValues.map(value => `<line class="chart-grid" x1="${pad.left}" y1="${y(value).toFixed(1)}" x2="${pad.left + inner.w}" y2="${y(value).toFixed(1)}" /><text class="chart-label" x="${pad.left - 8}" y="${(y(value) + 4).toFixed(1)}" text-anchor="end">${value}</text>`).join('');
  const dots = points.map((point, i) => `<circle class="chart-dot" cx="${x(i).toFixed(1)}" cy="${y(point.index).toFixed(1)}" r="4"><title>${point.date} · 指数 ${point.index} · 样本 ${point.sample}</title></circle>`).join('');
  // 首尾日期贴边对齐，否则最后一个日期会被右边界切掉
  const labels = points.map((point, i) => {
    const anchor = i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle';
    const labelX = i === 0 ? pad.left : i === points.length - 1 ? pad.left + inner.w : x(i);
    return `<text class="chart-date" x="${labelX.toFixed(1)}" y="${height - 8}" text-anchor="${anchor}">${point.date.slice(2)}</text>`;
  }).join('');
  const baseline = flat ? '' : `<line class="chart-grid" x1="${pad.left}" y1="${y(100).toFixed(1)}" x2="${pad.left + inner.w}" y2="${y(100).toFixed(1)}" stroke-dasharray="4 4" /><text class="chart-label" x="${pad.left + inner.w}" y="${(y(100) - 6).toFixed(1)}" text-anchor="end">基准 100</text>`;
  const flatLabel = flat ? `<text class="chart-value" x="${pad.left + inner.w / 2}" y="${(y(points[0].index) - 12).toFixed(1)}" text-anchor="middle">两次观测都是 ${points[0].index}，没有变化</text>` : '';

  return `<figure class="history-chart"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="价格变化指数折线，基准 100">${grid}${baseline}<path class="chart-line chart-input" d="${segments.join(' ')}" fill="none" />${flatLabel}${dots}${labels}</svg><figcaption>指数只在观测日取值，不插值。</figcaption></figure>`;
}
