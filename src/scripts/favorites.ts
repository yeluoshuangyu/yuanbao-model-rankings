const FAVORITES_KEY = 'yuanbao:favorites:v1';
const COMPARE_KEY = 'yuanbao:compare:v1';

function read(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function write(key: string, ids: string[]) {
  try { localStorage.setItem(key, JSON.stringify(ids)); } catch { /* 隐私模式或配额用尽时静默降级 */ }
}

export const loadFavorites = () => new Set(read(FAVORITES_KEY));
export const saveFavorites = (ids: Set<string>) => write(FAVORITES_KEY, [...ids]);
export const loadCompare = () => new Set(read(COMPARE_KEY));
export const saveCompare = (ids: Set<string>) => write(COMPARE_KEY, [...ids]);

/** Reflect stored state onto freshly rendered rows. */
export function paintRowTools(favorites: Set<string>, compare: Set<string>) {
  document.querySelectorAll<HTMLButtonElement>('[data-favorite]').forEach(button => {
    const active = favorites.has(button.dataset.favorite!);
    button.setAttribute('aria-pressed', String(active));
    button.classList.toggle('is-active', active);
    const glyph = button.querySelector('span');
    if (glyph) glyph.textContent = active ? '★' : '☆';
  });
  document.querySelectorAll<HTMLButtonElement>('[data-compare-toggle]').forEach(button => {
    const active = compare.has(button.dataset.compareToggle!);
    button.setAttribute('aria-pressed', String(active));
    button.classList.toggle('is-active', active);
  });
  const counter = document.getElementById('favorites-count');
  if (counter) counter.textContent = String(favorites.size);
}
