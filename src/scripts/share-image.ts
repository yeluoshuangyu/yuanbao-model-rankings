import type { Catalog, Model } from '../lib/schema';
import { metricLabels, money, quote, statusLabels, tokens, type Filters, type Row } from '../lib/ranking';

const FONT = '"PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Microsoft YaHei", sans-serif';
const WIDTH = 1080;
const ROWS = 8;
const ROW_HEIGHT = 62;
const TOP = 244;

/**
 * 图里印的站点地址。读页面上的 canonical（由 SITE_URL 与 BASE_PATH 决定），
 * 换仓库、换自定义域名都不必改代码。没有 canonical 时退回当前主机名。
 */
function siteLabel(): string {
  // 主机名取 canonical（部署地址），路径取 Layout 写进 meta 的 base：
  // 详情页与工具页的 canonical 各带自己的路径，直接截 canonical 会把 /compare 或 /models/<id> 印到图上。
  const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? '';
  let host = location.host;
  if (canonical) { try { host = new URL(canonical).host || host; } catch { /* 非绝对地址时退回当前主机 */ } }
  const base = document.querySelector('meta[name="yuanbao-base"]')?.getAttribute('content') || '/';
  return `${host}${base.startsWith('/') ? '' : '/'}${base}`.replace(/\/+$/, '');
}

function clip(context: CanvasRenderingContext2D, text: string, max: number) {
  if (context.measureText(text).width <= max) return text;
  let value = text;
  while (value.length > 1 && context.measureText(`${value}…`).width > max) value = value.slice(0, -1);
  return `${value}…`;
}

function rounded(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

export function drawRanking(rows: Row[], filters: Filters, catalog: Catalog, today = new Date()) {
  const list = rows.slice(0, ROWS);
  const height = TOP + list.length * ROW_HEIGHT + 96;
  const canvas = document.createElement('canvas');
  const scale = 2;
  canvas.width = WIDTH * scale;
  canvas.height = height * scale;
  const context = canvas.getContext('2d')!;
  context.scale(scale, scale);
  context.textBaseline = 'middle';

  const background = context.createLinearGradient(0, 0, WIDTH, height);
  background.addColorStop(0, '#fdfcf9');
  background.addColorStop(1, '#f2f0ea');
  context.fillStyle = background;
  context.fillRect(0, 0, WIDTH, height);

  context.fillStyle = '#0a2540';
  context.font = `700 40px ${FONT}`;
  context.fillText('源宝模型排行榜', 64, 86);
  context.fillStyle = '#6b7280';
  context.font = `400 20px ${FONT}`;
  context.fillText('官方价格 · 人民币口径 · 每 6 小时核验', 64, 126);

  const date = today.toISOString().slice(0, 10);
  context.fillStyle = '#0a2540';
  context.font = `600 22px ${FONT}`;
  const headline = `${metricLabels[filters.metric]}${filters.order === 'asc' ? '从低到高' : '从高到低'} · 前 ${list.length} 名`;
  context.fillText(headline, 64, 158);
  context.fillStyle = '#8b8f98';
  context.font = `400 17px ${FONT}`;
  context.textAlign = 'right';
  context.fillText(`${date} · $1 = ¥${money(filters.fx ?? catalog.meta.usdToCny)} · ${filters.inputTokens.toLocaleString('zh-CN')}+${filters.outputTokens.toLocaleString('zh-CN')} tokens`, WIDTH - 64, 158);
  context.textAlign = 'left';

  context.strokeStyle = 'rgba(10,37,64,0.12)';
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(64, 186);
  context.lineTo(WIDTH - 64, 186);
  context.stroke();

  const columns = [
    { x: 64, label: '#', width: 56, align: 'left' as const },
    { x: 128, label: '模型', width: 420, align: 'left' as const },
    { x: 560, label: '输入', width: 150, align: 'right' as const },
    { x: 726, label: '输出', width: 150, align: 'right' as const },
    { x: 892, label: '任务成本', width: 124, align: 'right' as const },
  ];
  context.fillStyle = '#8b8f98';
  context.font = `500 17px ${FONT}`;
  for (const column of columns) {
    context.textAlign = column.align;
    context.fillText(column.label, column.align === 'right' ? column.x + column.width : column.x, 208);
  }

  list.forEach((row, index) => {
    const y = TOP + index * ROW_HEIGHT;
    if (index % 2 === 0) {
      context.fillStyle = 'rgba(10,37,64,0.035)';
      rounded(context, 48, y - ROW_HEIGHT / 2 + 4, WIDTH - 96, ROW_HEIGHT - 8, 12);
      context.fill();
    }
    context.fillStyle = '#9aa0aa';
    context.font = `600 20px ${FONT}`;
    context.textAlign = 'left';
    context.fillText(String(row.rank).padStart(2, '0'), 64, y);
    context.fillStyle = '#0a2540';
    context.font = `600 22px ${FONT}`;
    context.fillText(clip(context, row.model.name, 300), 128, y - 9);
    context.fillStyle = '#8b8f98';
    context.font = `400 15px ${FONT}`;
    context.fillText(clip(context, catalog.providers.find(provider => provider.id === row.model.providerId)?.shortName ?? '', 300), 128, y + 14);
    context.fillStyle = '#0a2540';
    context.font = `500 20px ${FONT}`;
    context.textAlign = 'right';
    context.fillText(`¥${money(row.input)}`, 560 + 150, y);
    context.fillText(`¥${money(row.output)}`, 726 + 150, y);
    context.fillStyle = index === 0 ? '#0a7d5a' : '#0a2540';
    context.font = `600 21px ${FONT}`;
    context.fillText(`¥${money(row.task, true)}`, 892 + 124, y);
  });

  const footerY = TOP + list.length * ROW_HEIGHT + 32;
  context.textAlign = 'left';
  context.fillStyle = '#8b8f98';
  context.font = `400 16px ${FONT}`;
  context.fillText(`共 ${rows.length} 款在售模型 · 价格单位：人民币 / 百万 Token；任务成本：人民币 / 次 · 汇率与促销以官方账单为准`, 64, footerY);
  context.fillStyle = '#0a2540';
  context.font = `500 16px ${FONT}`;
  context.fillText(siteLabel(), 64, footerY + 26);
  return canvas;
}

export async function downloadRanking(rows: Row[], filters: Filters, catalog: Catalog) {
  const canvas = drawRanking(rows, filters, catalog);
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('榜单图生成失败');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `yuanbao-ranking-${new Date().toISOString().slice(0, 10)}.png`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * 对比结果图：最多四列并排，指标取「决定该不该换」的那几行。
 * 与榜单图共用同一套画布工具和站点标注，视觉上是一家人。
 */
export function drawCompare(models: Model[], catalog: Catalog, filters: Filters, today = new Date()) {
  const usdToCny = filters.fx ?? catalog.meta.usdToCny;
  const quotes = models.map(model => quote(model, { ...filters, fx: usdToCny }, usdToCny, today.toISOString().slice(0, 10)));
  const columns = models.length;
  const labelWidth = 226;
  const left = 64;
  const usable = WIDTH - left * 2 - labelWidth;
  const columnWidth = usable / Math.max(1, columns);
  const rowHeight = 58;
  const top = 250;

  type Cell = { text: string; number: number | null; best: 'min' | 'max' | 'none' };
  const cell = (values: (string | null)[], numbers: (number | null)[], best: 'min' | 'max' | 'none' = 'none'): Cell[] => {
    const valid = numbers.filter((value): value is number => value !== null);
    const target = best === 'min' ? Math.min(...valid) : Math.max(...valid);
    return values.map((text, index) => ({ text: text ?? '—', number: numbers[index], best: best === 'none' || valid.length < 2 ? 'none' : numbers[index] === target ? best : 'none' }));
  };
  const price = (field: 'input' | 'output' | 'cache' | 'task', best: 'min' | 'max' | 'none' = 'min') => cell(
    quotes.map(value => (value && value[field] !== null ? `¥${money(value[field]!, field === 'task')}` : null)),
    quotes.map(value => (value && value[field] !== null ? value[field]! : null)),
    best,
  );

  const rows: { label: string; cells: Cell[] }[] = [
    { label: '输入（每百万 Token）', cells: price('input') },
    { label: '输出（每百万 Token）', cells: price('output') },
    { label: '缓存读取', cells: price('cache') },
    { label: '单次任务成本', cells: price('task') },
    { label: '上下文窗口', cells: cell(models.map(model => tokens(model.contextTokens)), models.map(model => model.contextTokens), 'max') },
    { label: '阶梯档位', cells: cell(models.map(model => `${model.rates.length} 档`), models.map(model => model.rates.length), 'none') },
    { label: '模型状态', cells: cell(models.map(model => statusLabels[model.status]), models.map(() => null), 'none') },
  ];

  const height = top + rows.length * rowHeight + 104;
  const canvas = document.createElement('canvas');
  const scale = 2;
  canvas.width = WIDTH * scale;
  canvas.height = height * scale;
  const context = canvas.getContext('2d')!;
  context.scale(scale, scale);
  context.textBaseline = 'middle';

  const background = context.createLinearGradient(0, 0, WIDTH, height);
  background.addColorStop(0, '#fdfcf9');
  background.addColorStop(1, '#f2f0ea');
  context.fillStyle = background;
  context.fillRect(0, 0, WIDTH, height);

  context.fillStyle = '#0a2540';
  context.font = `700 40px ${FONT}`;
  context.fillText('源宝模型对比', left, 86);
  context.fillStyle = '#6b7280';
  context.font = `400 20px ${FONT}`;
  context.fillText(`${columns} 款并排 · 官方价格 · 人民币口径 · 每 6 小时核验`, left, 126);
  const today2 = today.toISOString().slice(0, 10);
  context.textAlign = 'right';
  context.fillStyle = '#8b8f98';
  context.font = `400 18px ${FONT}`;
  context.fillText(`${today2} · $1 = ¥${usdToCny.toFixed(2)}`, WIDTH - left, 126);
  context.textAlign = 'left';

  // 表头：模型名 + 厂商
  models.forEach((model, index) => {
    const x = left + labelWidth + index * columnWidth;
    const provider = catalog.providers.find(item => item.id === model.providerId)?.shortName ?? '';
    context.fillStyle = '#0a2540';
    context.font = `600 19px ${FONT}`;
    context.fillText(clip(context, model.name, columnWidth - 18), x, 186);
    context.fillStyle = '#8b8f98';
    context.font = `400 14px ${FONT}`;
    context.fillText(clip(context, provider, columnWidth - 18), x, 210);
  });
  context.strokeStyle = '#dcd8d0';
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(left, 232);
  context.lineTo(WIDTH - left, 232);
  context.stroke();

  rows.forEach((row, index) => {
    const y = top + index * rowHeight;
    context.fillStyle = '#6b7280';
    context.font = `400 16px ${FONT}`;
    context.fillText(row.label, left, y);
    row.cells.forEach((item, column) => {
      const x = left + labelWidth + column * columnWidth;
      const best = item.best !== 'none';
      context.fillStyle = best ? '#0a7d5a' : '#0a2540';
      context.font = `${best ? 600 : 500} 19px ${FONT}`;
      context.fillText(clip(context, item.text, columnWidth - 14), x, y);
    });
    if (index < rows.length - 1) {
      context.strokeStyle = '#eceae4';
      context.beginPath();
      context.moveTo(left, y + rowHeight / 2);
      context.lineTo(WIDTH - left, y + rowHeight / 2);
      context.stroke();
    }
  });

  const footerY = top + rows.length * rowHeight + 26;
  context.fillStyle = '#8b8f98';
  context.font = `400 15px ${FONT}`;
  context.fillText(`绿色为该项最优；任务成本按 ${filters.inputTokens.toLocaleString('zh-CN')} 输入 + ${filters.outputTokens.toLocaleString('zh-CN')} 输出计；价格以官方账单为准`, left, footerY);
  context.fillStyle = '#0a2540';
  context.font = `500 16px ${FONT}`;
  context.fillText(siteLabel(), left, footerY + 28);
  return canvas;
}

export async function downloadCompare(models: Model[], catalog: Catalog, filters: Filters) {
  const canvas = drawCompare(models, catalog, filters);
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('对比图生成失败');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `yuanbao-compare-${new Date().toISOString().slice(0, 10)}.png`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
