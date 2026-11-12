const tabs = [...document.querySelectorAll<HTMLButtonElement>('[data-value-tab]')];
const boards = [...document.querySelectorAll<HTMLElement>('[data-value-board]')];
const valid = new Set(tabs.map(tab => tab.dataset.valueTab!));
function select(category: string, push = false) {
  const target = valid.has(category) ? category : tabs[0].dataset.valueTab!;
  tabs.forEach(tab => tab.setAttribute('aria-selected', String(tab.dataset.valueTab === target)));
  boards.forEach(board => { board.hidden = board.dataset.valueBoard !== target; });
  const p = new URLSearchParams(location.search);
  if (target === tabs[0].dataset.valueTab) p.delete('category'); else p.set('category', target);
  const url = `${location.pathname}${p.size ? `?${p}` : ''}`;
  if (url !== `${location.pathname}${location.search}`) history[push ? 'pushState' : 'replaceState'](null, '', url);
}
tabs.forEach(tab => tab.addEventListener('click', () => select(tab.dataset.valueTab!, true)));
window.addEventListener('popstate', () => select(new URLSearchParams(location.search).get('category') ?? ''));
select(new URLSearchParams(location.search).get('category') ?? '');
