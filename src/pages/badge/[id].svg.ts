import type { APIRoute } from 'astro';
import { catalog } from '../../lib/catalog';
import { money } from '../../lib/ranking';

export const prerender = true;

export function getStaticPaths() {
  return catalog.models.map(model => ({ params: { id: model.id } }));
}

const FONT = '"PingFang SC","Hiragino Sans GB","Noto Sans SC","Microsoft YaHei",system-ui,sans-serif';
// 汉字按 1em 估宽，拉丁字符按 0.58em；徽章是固定字号的 SVG，宽一点比截断好。
const width = (text: string) => Math.round([...text].reduce((sum, char) => sum + (/[\u4e00-\u9fa5]/.test(char) ? 14 : 8.1), 0));

const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

/**
 * Shields 风格的静态徽章，可以直接嵌进 README：
 * `![价格](https://…/badge/glm-4-7.svg)`。数值取第一档输入价（人民币 / 百万 Token）。
 */
export const GET: APIRoute = ({ params }) => {
  const model = catalog.models.find(item => item.id === params.id);
  if (!model) return new Response('not found', { status: 404 });
  const fx = model.currency === 'USD' ? catalog.meta.usdToCny : 1;
  const rate = model.rates[0];
  const input = rate.input * fx;
  const label = model.name.length > 22 ? `${model.name.slice(0, 21)}…` : model.name;
  const value = input > 0 ? `¥${money(input)}/M` : '免费';
  const left = width(label) + 16;
  const right = width(value) + 16;
  const title = `${model.name} · 输入 ¥${money(input)} / 输出 ¥${money(rate.output * fx)} 每百万 Token（${model.currency}，${catalog.meta.updatedAt} 核验）`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${left + right}" height="20" role="img" aria-label="${escape(label)}: ${escape(value)}">
  <title>${escape(title)}</title>
  <linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#fff" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
  <clipPath id="r"><rect width="${left + right}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${left}" height="20" fill="#555"/>
    <rect x="${left}" width="${right}" height="20" fill="${input > 0 ? '#0a7d5a' : '#0071e3'}"/>
    <rect width="${left + right}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family='${FONT}' font-size="11">
    <text x="${left / 2}" y="14">${escape(label)}</text>
    <text x="${left + right / 2}" y="14">${escape(value)}</text>
  </g>
</svg>`;
  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      // 徽章会被外站引用，允许长缓存；价格变了文件名不变，所以给一天。
      'Cache-Control': 'public, max-age=86400',
    },
  });
};
