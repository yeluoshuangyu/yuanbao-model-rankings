import type { Catalog } from '../lib/schema';
import { metricLabels, money, type Filters, type Row } from '../lib/ranking';

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
  const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? '';
  const value = canonical || location.host;
  return value.replace(/^https?:\/\//, '').replace(/\/+$/, '');
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
