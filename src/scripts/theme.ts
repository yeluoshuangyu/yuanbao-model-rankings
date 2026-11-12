/*
 * 深色模式开关。选择写入 localStorage，与系统偏好互不干扰：
 * 没选过 → 跟随 prefers-color-scheme；选过 → 一律用用户的选择。
 */
const STORAGE_KEY = 'yuanbao:theme';
const LIGHT: Record<string, string> = {
  'theme-color': '#f5f5f7',
};
const DARK: Record<string, string> = {
  'theme-color': '#0c0c0e',
};

type Theme = 'light' | 'dark';

const root = document.documentElement;

function stored(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'dark' || value === 'light' ? value : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function current(): Theme {
  const explicit = root.dataset.theme;
  if (explicit === 'dark' || explicit === 'light') return explicit;
  return systemTheme();
}

function paint(theme: Theme): void {
  if (theme === 'dark') root.dataset.theme = 'dark';
  else root.dataset.theme = 'light';
  const palette = theme === 'dark' ? DARK : LIGHT;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', palette['theme-color']);
  for (const button of document.querySelectorAll<HTMLElement>('.theme-toggle')) {
    button.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    button.setAttribute('aria-label', theme === 'dark' ? '切换到浅色模式' : '切换到深色模式');
    button.setAttribute('title', theme === 'dark' ? '切换到浅色模式' : '切换到深色模式');
  }
}

function syncChrome(): void {
  paint(current());
}

paint(stored() ?? systemTheme());

for (const button of document.querySelectorAll<HTMLElement>('.theme-toggle')) {
  button.addEventListener('click', () => {
    const next: Theme = current() === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* 隐私模式下写不进去也不影响本次切换 */
    }
    paint(next);
  });
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (!stored()) paint(systemTheme());
});

document.addEventListener('astro:page-load', syncChrome);
syncChrome();
