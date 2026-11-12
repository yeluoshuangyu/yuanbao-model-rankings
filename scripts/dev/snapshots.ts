/**
 * 视觉回归快照：把 `dist` 里的静态页展开成「不依赖服务器、不依赖脚本」的自包含 HTML，
 * 再用本机 Chrome 截整页 PNG。纯静态站没有水合，所以剥离 `<script>` 后页面依然是最终形态，
 * 只有客户端渲染的区块（月账单、对比表、迁移表）需要在这里用同一批 lib 函数预先填好。
 *
 *   npm run build
 *   npm run snap                       # 生成 .shots/*.html
 *   npm run snap -- --shot             # 顺便截 1440px 整页 PNG
 *   npm run snap -- --shot --width=390 # 手机宽度
 *   npm run snap -- --shot --only=home,value
 *   npm run snap -- --shot --theme=dark   # 深色模式快照
 *   npm run snap -- --shot --chrome="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
 *
 * 退出码：快照生成失败为 1；只是找不到 Chrome 时打印提示并以 0 退出（CI 里可以只跑 HTML 快照）。
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { catalog } from '../../src/lib/catalog';
import { renderCompare } from '../../src/lib/compare';
import { migrationTable, renderMigrationBody } from '../../src/lib/migration';
import { defaultFilters, getRows, type Row } from '../../src/lib/ranking';
import { renderMonthly } from '../../src/scripts/monthly';

const root = process.cwd();
const dist = resolve(root, 'dist');
const outDir = resolve(root, '.shots');
const today = new Date().toISOString().slice(0, 10);

const args = process.argv.slice(2);
const has = (name: string) => args.some(argument => argument === `--${name}` || argument.startsWith(`--${name}=`));
const option = (name: string, fallback: string) => args.find(argument => argument.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;

if (!existsSync(dist)) {
  console.error('找不到 dist/，先跑 `npm run build`。');
  process.exit(1);
}

const width = Number(option('width', '1440'));
const only = option('only', '').split(',').map(value => value.trim()).filter(Boolean);
const wantShot = has('shot');
const theme = option('theme', 'light') === 'dark' ? 'dark' : 'light';
const pageFilter = (name: string) => !only.length || only.includes(name);

/** 站点部署在子路径下，资源链接都带这个前缀；从产物里读出来，避免和 BASE_PATH 对不上。 */
function detectBase(html: string): string {
  const match = html.match(/(?:href|src)="([^"]*)_astro\//);
  if (match) return match[1];
  const fallback = process.env.BASE_PATH ?? '/';
  return fallback.endsWith('/') ? fallback : `${fallback}/`;
}

/** dist 相对 .shots 的前缀，形如 `../dist/`，让快照在 file:// 下也能找到图标与页面。 */
const assetPrefix = (() => {
  const from = outDir.split('/').filter(Boolean);
  const to = dist.split('/').filter(Boolean);
  let shared = 0;
  while (shared < from.length && shared < to.length && from[shared] === to[shared]) shared += 1;
  return `${'../'.repeat(from.length - shared)}${to.slice(shared).join('/')}/`;
})();

function readPage(page: string): string {
  const file = resolve(dist, page);
  if (!existsSync(file)) throw new Error(`缺少产物页面：${page}`);
  return readFileSync(file, 'utf8');
}

interface SnapshotPatch { needle: string | RegExp; value: string }

/**
 * 把页面变成自包含 HTML：内联 CSS、剥离脚本、套用注入补丁，最后统一把子路径资源改成本地相对路径。
 * 补丁必须放在改写之前，这样注入片段里的绝对链接也会一起变成 `../dist/...`。
 */
function snapshot(page: string, patches: SnapshotPatch[] = []): string {
  let html = readPage(page);
  const base = detectBase(html);
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  html = html.replace(new RegExp(`<link rel="stylesheet" href="${escaped}(_astro\\/[^"]+\\.css)"[^>]*>`, 'g'),
    (_match, href: string) => `<style>\n${readFileSync(resolve(dist, href), 'utf8')}\n</style>`);
  html = html.replace(/<script[\s\S]*?<\/script>/g, '');
  for (const patch of patches) html = html.replace(patch.needle, patch.value);
  if (theme === 'dark') html = html.replace(/<html([^>]*)>/, '<html$1 data-theme="dark">');
  html = html.replace(new RegExp(`(href|src|poster|content)="${escaped}`, 'g'), `$1="${assetPrefix}`);
  return html;
}

function write(name: string, html: string) {
  writeFileSync(resolve(outDir, `${name}.html`), html);
  console.log(`  ${name}.html  ${(html.length / 1024).toFixed(0)}KB`);
}

const emptyDiv = (id: string) => new RegExp(`<div id="${id}"[^>]*></div>`);
const { rows } = getRows(catalog, defaultFilters, today);
const listRow = rows as Row[];

/* ---------------------------------------------------------------- 各页面注入 */

const monthly = {
  needle: emptyDiv('monthly-body'),
  value: `<div id="monthly-body" class="monthly-body" aria-live="polite">${renderMonthly(listRow, defaultFilters, `${detectBase(readPage('index.html'))}`, 1000, 30)}</div>`,
};

const compareIds = ['glm-4-7', 'gpt-5-6-luna', 'claude-opus-5-5'].filter(id => catalog.models.some(model => model.id === id));
const compareModels = compareIds.map(id => catalog.models.find(model => model.id === id)!);
const comparePatches: SnapshotPatch[] = [
  { needle: /<section id="compare-panel"[^>]*hidden>/, value: '<section id="compare-panel" class="compare-panel" aria-labelledby="compare-title">' },
  { needle: '<div id="compare-empty" class="empty-state" hidden>', value: '<div id="compare-empty" class="empty-state" hidden>' },
  { needle: emptyDiv('compare-root'), value: `<div id="compare-root">${renderCompare(compareModels, catalog, defaultFilters, detectBase(readPage('compare/index.html')), today)}</div>` },
  { needle: '<span class="count-pill" id="compare-count">0</span>', value: `<span class="count-pill" id="compare-count">${compareModels.length}</span>` },
  {
    needle: emptyDiv('compare-suggestions'),
    value: `<div id="compare-suggestions" class="compare-suggestions" role="listbox" aria-label="可加入对比的模型">${
      listRow.slice(0, 5).map(row => `<button class="compare-suggestion" type="button" role="option" aria-selected="false"><span>${row.model.name}</span><small>¥${row.input.toFixed(2)}</small></button>`).join('')
    }</div>`,
  },
];

const modelId = option('model', 'gpt-5-6-luna');
const focus = catalog.models.find(model => model.id === modelId) ?? catalog.models[0];
const focusBase = detectBase(readPage('index.html'));
const migrationPatches: SnapshotPatch[] = [
  {
    needle: emptyDiv('migration-body'),
    value: `<div id="migration-body">${renderMigrationBody(migrationTable(focus, catalog, defaultFilters, 1000, 30, today), focus, focusBase)}</div>`,
  },
];

/* ------------------------------------------------------------ 分享图（Canvas） */

/**
 * 分享图是 canvas 绘制的，只能真的跑一遍才看得到。这里用 esbuild 把绘制模块打成 IIFE，
 * 连同数据一起塞进一个空白页面，浏览器加载后就会把图画在校准尺寸的 canvas 上。
 */
async function shareImagePage(): Promise<string | null> {
  try {
    const { build } = await import('esbuild');
    const bundled = await build({
      entryPoints: [resolve(root, 'src/scripts/share-image.ts')],
      bundle: true,
      format: 'iife',
      globalName: 'ShareImage',
      write: false,
      logLevel: 'silent',
      target: 'es2020',
    });
    const code = bundled.outputFiles[0].text;
    // 让预览和线上一致：分享图上的地址取自真实页面里的 canonical。
    const canonical = readPage('index.html').match(/<link rel="canonical" href="([^"]+)"/)?.[1] ?? '';
    const payload = JSON.stringify({
      rows: listRow,
      filters: { ...defaultFilters, providers: [] },
      catalog: { meta: catalog.meta, providers: catalog.providers, sources: catalog.sources },
    }).replace(/</g, '\\u003c');
    return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>分享图预览</title>${
      canonical ? `<link rel="canonical" href="${canonical}">` : ''
    }<style>
body { margin: 0; padding: 24px; background: #e9e9ec; display: flex; justify-content: center; font-family: -apple-system, "PingFang SC", sans-serif; }
canvas { width: 1080px; height: auto; border-radius: 14px; box-shadow: 0 20px 50px rgba(0, 0, 0, .2); }
</style></head><body><script>${code}</script><script>
const data = ${payload};
const canvas = ShareImage.drawRanking(data.rows, data.filters, data.catalog, new Date('${today}T00:00:00Z'));
canvas.style.width = '1080px';
document.body.appendChild(canvas);
</script></body></html>`;
  } catch (error) {
    console.warn(`  跳过分享图预览：${(error as Error).message}`);
    return null;
  }
}

/* ------------------------------------------------------------------ Chrome 截图 */

function findChrome(): string | null {
  const explicit = option('chrome', '');
  if (explicit) return existsSync(explicit) ? explicit : null;
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
  ];
  return candidates.find(candidate => existsSync(candidate)) ?? null;
}

/** 崩溃收集器在沙箱/CI 里常常直接失败，这几项是让 headless 稳定跑起来的关键。 */
function chromeArgs(profile: string, extra: string[]): string[] {
  return [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-crash-reporter',
    '--disable-breakpad',
    '--hide-scrollbars',
    '--force-color-profile=srgb',
    `--user-data-dir=${profile}`,
    ...extra,
  ];
}

/**
 * 用 CDP 截图，而不是 `--screenshot`：Chrome 的窗口最小宽度被钳在 500px，
 * `--window-size=390` 实际渲染的是 500px 再裁切，媒体查询也就不会命中。
 * 走 `Emulation.setDeviceMetricsOverride` 才能真正得到 390 CSS px 的视口。
 */
type Cdp = { send(method: string, params?: Record<string, unknown>): Promise<any>; close(): void };

async function openCdp(chrome: string, profile: string): Promise<Cdp> {
  const child = spawn(chrome, [
    ...chromeArgs(profile, ['--remote-debugging-port=0']),
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  const browser = await new Promise<string>((ok, fail) => {
    let buffer = '';
    const timer = setTimeout(() => fail(new Error(`DevTools 没起来：${buffer.trim()}`)), 20_000);
    child.stderr?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const found = buffer.match(/DevTools listening on (ws:\/\/\S+)/);
      if (found) {
        clearTimeout(timer);
        ok(found[1]);
      }
    });
  });

  const base = browser.replace('ws://', 'http://').replace(/\/devtools\/browser\/.*$/, '');
  const targets = await (await fetch(`${base}/json/list`)).json() as { type: string; webSocketDebuggerUrl: string }[];
  const page = targets.find(target => target.type === 'page');
  if (!page) throw new Error('没有可用的页面目标');

  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok, fail) => { socket.onopen = () => ok(null); socket.onerror = fail; });

  let seq = 0;
  const pending = new Map<number, { ok: (value: any) => void; fail: (error: Error) => void }>();
  socket.onmessage = (event: MessageEvent) => {
    const message = JSON.parse(String(event.data)) as { id?: number; result?: unknown; error?: unknown };
    if (!message.id) return;
    const slot = pending.get(message.id);
    if (!slot) return;
    pending.delete(message.id);
    message.error ? slot.fail(new Error(JSON.stringify(message.error))) : slot.ok(message.result);
  };

  const send = (method: string, params: Record<string, unknown> = {}) => new Promise<any>((ok, fail) => {
    const id = ++seq;
    pending.set(id, { ok, fail });
    socket.send(JSON.stringify({ id, method, params }));
  });

  await send('Page.enable');
  return { send, close() { socket.close(); child.kill(); } };
}

/** 截整页：先按视口宽度排版，量出 scrollHeight，再用 captureBeyondViewport 一次拍完。 */
async function shoot(cdp: Cdp, file: string, out: string, viewportWidth: number): Promise<boolean> {
  const scale = viewportWidth < 600 ? 2 : 1;
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: viewportWidth,
    height: 900,
    deviceScaleFactor: scale,
    mobile: viewportWidth < 600,
  });
  await cdp.send('Page.navigate', { url: `file://${file}` });
  await new Promise(done => setTimeout(done, 900));

  const measured = await cdp.send('Runtime.evaluate', {
    expression: 'Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)',
    returnByValue: true,
  });
  const height = Math.min(Number(measured?.result?.value ?? 0) || 900, 60_000);
  const shot = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: viewportWidth, height, scale: 1 },
  });
  if (!shot?.data) {
    console.warn(`  截图失败：${out}`);
    return false;
  }
  writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log(`  ${out.split('/').pop()}  ${viewportWidth}×${height}${scale > 1 ? ` @${scale}x` : ''}`);
  return true;
}

/* ---------------------------------------------------------------------- 主流程 */

mkdirSync(outDir, { recursive: true });
console.log(`快照输出：${outDir}`);

const produced: { name: string; file: string }[] = [];
function emit(name: string, html: string) {
  if (!pageFilter(name)) return;
  write(name, html);
  produced.push({ name, file: resolve(outDir, `${name}.html`) });
}

emit('home', snapshot('index.html', [monthly]));
emit('compare', snapshot('compare/index.html', comparePatches));
emit('value', snapshot('value/index.html'));
emit('model', snapshot(`models/${focus.id}/index.html`, migrationPatches));
emit('api', snapshot('api/index.html'));
emit('status', snapshot('status/index.html'));
emit('pelican', snapshot('pelican/index.html'));

// 分享对话框默认是关的，单独开一份来检查按钮与提示。
if (pageFilter('share')) {
  const html = snapshot('index.html', [monthly]).replace(
    '<dialog id="share-dialog">',
    '<dialog id="share-dialog" open style="border:none;border-radius:22px;position:fixed;top:90px;left:50%;transform:translateX(-50%);z-index:99;box-shadow:0 30px 80px rgba(0,0,0,.18)">',
  );
  emit('share', html);
}

if (pageFilter('share-png')) {
  const html = await shareImagePage();
  if (html) emit('share-png', html);
}

if (!wantShot) {
  console.log('只生成了 HTML。加 `-- --shot` 可以直接截整页 PNG。');
  process.exit(0);
}

const chrome = findChrome();
if (!chrome) {
  console.warn('没找到 Chrome/Chromium，跳过截图（可用 --chrome=/path/to/chrome 指定）。');
  process.exit(0);
}

const profileDir = mkdtempSync(join(tmpdir(), 'yuanbao-chrome-'));
const shotsDir = resolve(outDir, theme === 'dark' ? `shots-${width}-dark` : `shots-${width}`);
mkdirSync(shotsDir, { recursive: true });
let failures = 0;
let cdp: Cdp | null = null;
try {
  cdp = await openCdp(chrome, profileDir);
  for (const page of produced) {
    const ok = await shoot(cdp, page.file, resolve(shotsDir, `${page.name}.png`), width);
    if (!ok) failures += 1;
  }
} catch (error) {
  console.warn(`截图失败：${(error as Error).message}`);
  failures = 1;
} finally {
  cdp?.close();
  try { rmSync(profileDir, { recursive: true, force: true }); } catch { /* Chrome 可能还在收尾，临时目录留着无妨 */ }
}

if (failures) {
  console.error(`有 ${failures} 张截图没生成出来。`);
  process.exit(1);
}
console.log(`\n截图完成：${shotsDir}`);
