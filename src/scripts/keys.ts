/**
 * 榜单键盘操作：j/k 移动、Enter 打开详情、f 收藏、c 加入对比、? 看快捷键。
 * 只在该页确实有榜单行时生效，其他页面按下这些键不会有反应。
 */
const SELECTED = 'is-selected';

function rows(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('#table-body tr[data-model-id]')];
}

function current(): number {
  return rows().findIndex(row => row.classList.contains(SELECTED));
}

function focusRow(index: number) {
  const list = rows();
  if (!list.length) return;
  const next = Math.max(0, Math.min(list.length - 1, index));
  list.forEach(row => {
    row.classList.remove(SELECTED);
    row.removeAttribute('data-kb-focus');
  });
  const row = list[next];
  row.classList.add(SELECTED);
  row.setAttribute('data-kb-focus', 'true');
  row.scrollIntoView({ block: 'nearest' });
}

function clickTool(row: HTMLElement, selector: string) {
  row.querySelector<HTMLElement>(selector)?.click();
}

function help(): HTMLDialogElement {
  const existing = document.getElementById('shortcut-help') as HTMLDialogElement | null;
  if (existing) return existing;
  const dialog = document.createElement('dialog');
  dialog.id = 'shortcut-help';
  dialog.className = 'shortcut-help';
  dialog.setAttribute('aria-label', '键盘快捷键');
  dialog.innerHTML = `<h2>键盘快捷键</h2>
    <dl>
      <div><dt><kbd>/</kbd></dt><dd>聚焦搜索框</dd></div>
      <div><dt><kbd>⌘K</kbd> / <kbd>Ctrl K</kbd></dt><dd>打开快速跳转</dd></div>
      <div><dt><kbd>j</kbd> / <kbd>k</kbd></dt><dd>在榜单里上下移动</dd></div>
      <div><dt><kbd>Enter</kbd></dt><dd>打开当前行的详情</dd></div>
      <div><dt><kbd>f</kbd></dt><dd>收藏 / 取消收藏当前行</dd></div>
      <div><dt><kbd>c</kbd></dt><dd>把当前行加入 / 移出对比</dd></div>
      <div><dt><kbd>?</kbd></dt><dd>显示这份清单</dd></div>
      <div><dt><kbd>Esc</kbd></dt><dd>关闭弹窗</dd></div>
    </dl>
    <form method="dialog"><button class="primary-button">知道了</button></form>`;
  document.body.append(dialog);
  return dialog;
}

export function initShortcuts() {
  document.addEventListener('keydown', event => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const origin = event.target instanceof Element ? event.target : null;
    if (origin?.closest('input, textarea, select, [contenteditable="true"], dialog')) return;

    const list = rows();
    const key = event.key;

    if (key === '?') { event.preventDefault(); help().showModal(); return; }
    if (!list.length) return;

    if (key === 'j' || key === 'k') {
      event.preventDefault();
      const at = current();
      focusRow(at === -1 ? 0 : at + (key === 'j' ? 1 : -1));
      return;
    }
    const at = current();
    if (at === -1) return;
    const row = list[at];
    if (key === 'Enter') {
      const link = row.querySelector<HTMLAnchorElement>('a.model-link');
      if (link) { event.preventDefault(); location.href = link.href; }
    } else if (key === 'f') {
      event.preventDefault();
      clickTool(row, '[data-favorite]');
    } else if (key === 'c') {
      event.preventDefault();
      clickTool(row, '[data-compare-toggle]');
    }
  });
}
