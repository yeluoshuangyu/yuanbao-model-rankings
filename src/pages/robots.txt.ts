import type { APIRoute } from 'astro';

export const prerender = true;

export const GET: APIRoute = ({ site }) => {
  const origin = (site ?? new URL(import.meta.env.SITE ?? 'http://localhost:4321')).origin;
  const base = import.meta.env.BASE_URL;
  const text = `User-agent: *
Allow: /
Disallow: ${base}data/

Sitemap: ${origin}${base}sitemap.xml
`;
  return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
