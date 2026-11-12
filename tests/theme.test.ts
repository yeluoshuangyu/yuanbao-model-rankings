import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

/*
 * 深色模式开关是纯浏览器脚本：这里用最小化的 document / window 替身跑真实源码，
 * 覆盖「首屏按偏好定主题、点击切换并记住、系统改主题后跟随、清空选择后回到系统」四条路径。
 */
interface Stub {
  attributes: Map<string, string>;
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | undefined;
  listeners: ((event: unknown) => unknown)[];
  addEventListener(type: string, callback: (event: unknown) => unknown): void;
}

function stub(initial: Record<string, string> = {}): Stub {
  return {
    attributes: new Map(Object.entries(initial)),
    setAttribute(name, value) { this.attributes.set(name, value); },
    getAttribute(name) { return this.attributes.get(name); },
    listeners: [],
    addEventListener(_type, callback) { this.listeners.push(callback); },
  };
}

function load(options: { stored?: string | null; systemDark?: boolean } = {}) {
  const dataset: Record<string, string> = {};
  const meta = stub({ content: '#f5f5f7' });
  const button = stub({ 'aria-pressed': 'false' });
  const store = new Map<string, string>();
  if (options.stored) store.set('yuanbao:theme', options.stored);

  const media = {
    matches: options.systemDark ?? false,
    change: [] as ((event: unknown) => unknown)[],
    addEventListener(_type: string, callback: (event: unknown) => unknown) { this.change.push(callback); },
  };
  const documentListeners = new Map<string, ((event: unknown) => unknown)[]>();

  const context = vm.createContext({
    document: {
      documentElement: { dataset },
      querySelector: (selector: string) => (selector.includes('theme-color') ? meta : null),
      querySelectorAll: () => [button],
      addEventListener: (type: string, callback: (event: unknown) => unknown) => {
        documentListeners.set(type, [...(documentListeners.get(type) ?? []), callback]);
      },
    },
    window: { matchMedia: () => media },
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
    },
    matchMedia: () => media,
  });

  const source = readFileSync(new URL('../src/scripts/theme.ts', import.meta.url), 'utf8');
  vm.runInContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);

  return {
    theme: () => dataset.theme,
    metaColor: () => meta.attributes.get('content'),
    pressed: () => button.attributes.get('aria-pressed'),
    stored: () => store.get('yuanbao:theme') ?? null,
    click: () => { for (const listener of button.listeners) listener({}); },
    systemChange: (matches: boolean) => { media.matches = matches; for (const listener of media.change) listener({}); },
    forget: () => store.clear(),
    reload: () => { /* 重新执行脚本以模拟二次访问，复用一个 store */ },
  };
}

test('没有存过选择时跟随系统：深色系统首屏就是深色', () => {
  const app = load({ systemDark: true });
  assert.equal(app.theme(), 'dark');
  assert.equal(app.pressed(), 'true');
  assert.equal(app.metaColor(), '#0c0c0e');
});

test('没有存过选择且系统浅色：保持浅色', () => {
  const app = load({ systemDark: false });
  assert.equal(app.theme(), 'light');
  assert.equal(app.metaColor(), '#f5f5f7');
});

test('点击切换写入 localStorage，并同步按钮与 theme-color', () => {
  const app = load({ systemDark: false });
  app.click();
  assert.equal(app.theme(), 'dark');
  assert.equal(app.stored(), 'dark');
  assert.equal(app.pressed(), 'true');
  assert.equal(app.metaColor(), '#0c0c0e');
  app.click();
  assert.equal(app.theme(), 'light');
  assert.equal(app.stored(), 'light');
  assert.equal(app.metaColor(), '#f5f5f7');
});

test('存过选择时以用户选择为准，忽略系统偏好', () => {
  const app = load({ stored: 'light', systemDark: true });
  assert.equal(app.theme(), 'light');
  assert.equal(app.pressed(), 'false');
});

test('系统主题变化时，只有没存过选择才跟随', () => {
  const following = load({ systemDark: false });
  following.systemChange(true);
  assert.equal(following.theme(), 'dark');

  const pinned = load({ stored: 'light', systemDark: false });
  pinned.systemChange(true);
  assert.equal(pinned.theme(), 'light');
});

test('清空选择后重新跟随系统', () => {
  const app = load({ stored: 'dark', systemDark: false });
  assert.equal(app.theme(), 'dark');
  app.forget();
  app.systemChange(false);
  assert.equal(app.theme(), 'light', '清空选择后应重新跟随系统');
  app.systemChange(true);
  assert.equal(app.theme(), 'dark');
});
