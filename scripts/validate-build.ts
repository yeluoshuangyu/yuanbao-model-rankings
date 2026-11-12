import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { catalog } from '../src/lib/catalog';
const root = resolve(process.cwd(), process.env.BUILD_DIR || 'dist');
const base = `/${(process.env.BASE_PATH || '/').replace(/^\/+|\/+$/g, '')}`.replace(/\/$/, '') + '/';
async function walk(dir: string): Promise<string[]> {
  const items = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(items.map(item => item.isDirectory() ? walk(join(dir, item.name)) : [join(dir, item.name)]))).flat();
}
const files = await walk(root);
const htmlFiles = files.filter(file => file.endsWith('.html'));
// Landing pages: home, performance, pelican, 404, compare, value, open data, status.
const staticPages = 8;
assert.equal(htmlFiles.length, catalog.models.length + staticPages, `每条模型记录必须有永久详情 URL，另有 ${staticPages} 个静态页面`);
const performanceHtml = await readFile(join(root, 'performance/index.html'), 'utf8');
assert.match(performanceHtml, /Arena/);
assert.match(performanceHtml, /performance-body/);
const pelicanHtml = await readFile(join(root, 'pelican/index.html'), 'utf8');
assert.match(pelicanHtml, /id="pelican-board-title"/);
assert.match(pelicanHtml, /仅供娱乐/);
for (const page of ['compare', 'value', 'api', 'status']) {
  const html = await readFile(join(root, page, 'index.html'), 'utf8');
  assert.ok(html.includes(`href="${base}api/"`), `${page} 页面必须包含开放数据导航`);
}
const feed = await readFile(join(root, 'feed.xml'), 'utf8');
assert.match(feed, /<feed xmlns="http:\/\/www\.w3\.org\/2005\/Atom"/, '必须输出 Atom 订阅源');
assert.ok((feed.match(/<entry>/g) ?? []).length > 0, '订阅源至少要有一条事件');
const sitemap = await readFile(join(root, 'sitemap.xml'), 'utf8');
assert.equal((sitemap.match(/<url>/g) ?? []).length, catalog.models.length + staticPages - 1, '站点地图必须收录全部详情页与工具页（404 除外）');
assert.match(await readFile(join(root, 'robots.txt'), 'utf8'), /Sitemap: https?:\/\/\S+\/sitemap\.xml/);
const badges = files.filter(file => file.startsWith(join(root, 'badge')) && file.endsWith('.svg'));
assert.equal(badges.length, catalog.models.length, '每款模型都要有可嵌入的价格徽章');
const csv = await readFile(join(root, 'data/models.csv'), 'utf8');
assert.equal(csv.trim().split('\n').length, catalog.models.length + 1, 'CSV 必须每款模型一行');
let checked = 0;
for (const file of htmlFiles) {
  const html = await readFile(file, 'utf8');
  assert.match(html, /<html lang="zh-CN"/, `${file} 必须使用简体中文`);
  assert.ok(html.includes(`href="${base}pelican/"`), `${file} 必须包含鹈鹕测试榜导航`);
  for (const match of html.matchAll(/\b(href|src|poster)="([^"]+)"/g)) {
    const [, attribute, raw] = match;
    const value = raw.replace(/&amp;/g, '&');
    if (value.startsWith('#')) continue;
    if (/^https?:\/\//.test(value)) {
      assert.equal(attribute, 'href', `关键资源不可依赖第三方 CDN：${value}`);
      continue;
    }
    assert.ok(value.startsWith(base), `部署子路径丢失：${relative(root, file)} -> ${value}（期望 ${base}）`);
    const pathname = decodeURIComponent(new URL(value, 'https://local.example').pathname).slice(base.length);
    let target = join(root, pathname);
    const info = await stat(target);
    if (info.isDirectory()) target = join(target, 'index.html');
    await stat(target); checked++;
  }
}
for (const css of files.filter(file => file.endsWith('.css'))) {
  assert.doesNotMatch(await readFile(css, 'utf8'), /(?:@import|url\()\s*["']?https?:/i, '样式不得远程加载关键字体或资源');
}
console.log(`构建产物校验通过：${htmlFiles.length} 个静态页面，${checked} 个本地链接 / 资源，部署路径 ${base}。`);
