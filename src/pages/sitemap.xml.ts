import type { APIRoute } from 'astro';
import { catalog } from '../lib/catalog';
import { pathFor } from '../lib/render';

export const prerender = true;

/**
 * 站点地图：首页、五个工具页、状态页、161 个模型详情页。
 * 数据端点（data/*.json、models.csv、徽章 SVG）不进站点地图，它们不是给人读的落地页。
 */
export const GET: APIRoute = ({ site }) => {
  const origin = (site ?? new URL(import.meta.env.SITE ?? 'http://localhost:4321')).origin;
  const base = import.meta.env.BASE_URL;
  const pages = ['', 'value/', 'compare/', 'performance/', 'pelican/', 'api/', 'status/'];
  const urls = [
    ...pages.map(page => ({ loc: `${origin}${pathFor(base, page)}`, priority: page === '' ? '1.0' : '0.8' })),
    ...catalog.models.map(model => ({ loc: `${origin}${pathFor(base, `models/${model.id}/`)}`, priority: '0.6' })),
  ];
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(item => `  <url>
    <loc>${item.loc}</loc>
    <lastmod>${catalog.meta.updatedAt}</lastmod>
    <changefreq>${item.priority === '0.6' ? 'monthly' : 'weekly'}</changefreq>
    <priority>${item.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
