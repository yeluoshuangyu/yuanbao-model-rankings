/**
 * 命令面板：按 ⌘K / Ctrl+K 打开，数据在第一次打开时才拉 /data/catalog.json。
 * 不预先把 161 条模型塞进每个页面的 HTML —— 那会把首屏体积翻倍。
 */
type PaletteModel = { id: string; name: string; apiId: string; providerId: string; status: string };
type PaletteProvider = { id: string; name: string; shortName: string };
type PaletteCatalog = { models: PaletteModel[]; providers: PaletteProvider[] };

const MAX_RESULTS = 8;
const statusWord: Record<string, string> = { active: '在售', preview: '预览', deprecated: '仅存量', retired: '已退役' };

let loaded: Promise<PaletteCatalog> | null = null;
let models: { model: PaletteModel; provider: string; haystack: string }[] = [];
let results: typeof models = [];
let active = 0;
let dialog: HTMLDialogElement | null = null;
let input: HTMLInputElement | null = null;
let list: HTMLUListElement | null = null;

function base(): string {
  return document.getElementById('main')?.dataset.base ?? '/';
}

function loadCatalog(): Promise<PaletteCatalog> {
  loaded ??= fetch(`${base()}data/catalog.json`).then(response => {
    if (!response.ok) throw new Error(`catalog.json ${response.status}`);
    return response.json() as Promise<PaletteCatalog>;
  });
  return loaded;
}

function index(catalog: PaletteCatalog) {
  const names = new Map(catalog.providers.map(provider => [provider.id, provider.shortName]));
  models = catalog.models.map(model => ({
    model,
    provider: names.get(model.providerId) ?? model.providerId,
    haystack: `${model.name} ${model.apiId} ${model.id} ${names.get(model.providerId) ?? ''}`.toLowerCase(),
  }));
}

function search(term: string) {
  const needle = term.trim().toLowerCase();
  const pool = needle ? models.filter(item => needle.split(/\s+/).every(part => item.haystack.includes(part))) : models;
  results = pool.slice(0, MAX_RESULTS);
  active = 0;
  paint();
}

function paint() {
  if (!list) return;
  list.innerHTML = results.length
    ? results.map((item, i) => `<li role="option" aria-selected="${i === active}" data-index="${i}">
        <a href="${base()}models/${item.model.id}/">
          <span class="palette-name">${escapeHtml(item.model.name)}</span>
          <span class="palette-meta">${escapeHtml(item.provider)} · ${escapeHtml(item.model.apiId)} · ${statusWord[item.model.status] ?? item.model.status}</span>
        </a>
      </li>`).join('')
    : '<li class="palette-empty" role="option" aria-selected="false">没有匹配的模型，换个关键字试试。</li>';
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
}

function move(step: number) {
  if (!results.length) return;
  active = (active + step + results.length) % results.length;
  paint();
  list?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
}

function open() {
  if (!dialog) return;
  if (!dialog.open) dialog.showModal();
  input?.focus();
  input!.select();
  if (!models.length) {
    loadCatalog()
      .then(catalog => { index(catalog); search(''); })
      .catch(() => { if (list) list.innerHTML = '<li class="palette-empty" role="option" aria-selected="false">数据加载失败，请刷新重试。</li>'; });
  } else {
    search(input?.value ?? '');
  }
}

function go(index: number) {
  const target = results[index];
  if (!target) return;
  dialog?.close();
  location.href = `${base()}models/${target.model.id}/`;
}

export function initPalette() {
  const template = document.createElement('dialog');
  template.id = 'command-palette';
  template.className = 'command-palette';
  template.setAttribute('aria-label', '快速跳转模型');
  template.innerHTML = `<div class="palette-field"><span aria-hidden="true">⌘K</span><input type="search" id="palette-input" placeholder="搜索模型名、API ID 或厂商…" autocomplete="off" spellcheck="false" aria-controls="palette-results" aria-expanded="true" role="combobox" /></div>
    <ul id="palette-results" class="palette-results" role="listbox" aria-label="搜索结果"></ul>
    <p class="palette-hint">↑↓ 选择 · Enter 打开 · Esc 关闭</p>`;
  document.body.append(template);
  dialog = template;
  input = template.querySelector<HTMLInputElement>('#palette-input')!;
  list = template.querySelector<HTMLUListElement>('#palette-results')!;

  input.addEventListener('input', () => search(input!.value));
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown') { event.preventDefault(); move(1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); move(-1); }
    else if (event.key === 'Enter') { event.preventDefault(); go(active); }
  });
  list.addEventListener('click', event => {
    const row = (event.target as HTMLElement).closest<HTMLElement>('[data-index]');
    if (row) go(Number(row.dataset.index));
  });

  document.addEventListener('keydown', event => {
    const origin = event.target instanceof Element ? event.target : null;
    const typing = origin?.closest('input, textarea, select, [contenteditable="true"]');
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      open();
      return;
    }
    if (event.key === 'Escape' && dialog?.open) { dialog.close(); return; }
    if (typing) return;
    // 首页有专门的搜索框，`/` 先服务它；没有搜索框的页面才落到命令面板。
    if (event.key === '/') {
      const search = document.querySelector<HTMLInputElement>('#search');
      event.preventDefault();
      if (search) search.focus();
      else open();
    }
  });
}

export { loadCatalog };
