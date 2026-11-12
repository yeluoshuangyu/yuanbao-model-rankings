# v3.2 发布说明：对外数据工具与深色模式

发布日期：2026-11-12 · 站点 `https://yeluoshuangyu.github.io/yuanbao-model-rankings/`

本版不加模型、不改价格口径，只增加对外入口和一套主题。价格数据与 v3.1 相同：12 家厂商、161 条记录，默认显示 152 条。

## 1. 新增对外端点

| 端点 | 内容 | 说明 |
| --- | --- | --- |
| `/badge/<id>.svg` | 价格徽章，161 个 | 左段模型名，右段人民币输入价；零价显示“免费”。带 `Cache-Control: public, max-age=86400` |
| `/feed.xml` | Atom 订阅 | 每款模型只取最新一条上架或调价事件，最多 40 条；`<id>` 用事件 ID，重复轮次不会重复推送 |
| `/sitemap.xml` | 8 个工具页 + 161 个详情页 | `lastmod` 取目录更新时间 |
| `/robots.txt` | 抓取规则 | 允许抓页面，`Disallow` 掉 `/data/`；指向 sitemap |
| `/status/` | 数据状态页 | 核验方式、分厂商最后核验、沿用旧价明细、外部成绩榜日期、纠错入口 |

`/status/` 用警示色标出两类信号：超过 7 天未核验的厂商、超过 30 天未更新的外部成绩榜。当前实际状态是 DeepSeek 的最后核验停在 2026-09-12（人工适配，未自动刷新），其余厂商为当日。这是真实信号，不是渲染问题。

## 2. 深色模式

- 默认仍是浅色。右上角按钮切换，选择写入 `localStorage['yuanbao:theme']`，跨页保持；从未选择时跟随系统 `prefers-color-scheme`，并随系统变化实时切换。
- 色板集中到 `src/styles/theme.css`：浅色在 `:root`，深色同时覆盖 `[data-theme='dark']` 与 `prefers-color-scheme: dark`（后者用 `:root:not([data-theme='light'])` 让手动选择优先）。其余样式文件里的字面色值全部改为 `var(--…)`。
- 需要单独处理的地方：内联 SVG 图表（散点、折线、阶梯图）用 CSS 覆盖 presentation attribute；厂商 Logo 在深色下垫浅色托板；代码块改用 `--code-bg`/`--code-ink`，否则深色下会反成白块；`.primary-button` 等反色按钮的文字单独用 `--on-accent`。
- 散点图有个细节：OpenAI(#222222)、xAI(#25272e)、Kimi(#181e2d) 的品牌色在深色底上几乎不可见。做法是点的 `fill` 走 `color-mix(in srgb, var(--dot-color) 60%, #fff)`，只在深色下提亮，浅色保持原品牌色。
- 窄屏（< 600px）散点图保底 640px 宽并横向滚动，否则标签会挤成一团。

## 3. 工程变化

- 截图脚本改用 Chrome DevTools Protocol：`Emulation.setDeviceMetricsOverride` + `Page.captureScreenshot`。原来的 `--window-size` 路线不成立——Chrome 窗口最小宽度被钳在 500px，`--window-size=390` 实际渲染 500px 再裁切，`@media (max-width: 480px)` 从不命中。窄屏现在以 2 倍像素密度出图。
- 新增 `--theme=dark`，同一份 HTML 打上 `data-theme` 属性后截图，输出到 `.shots/shots-<width>-dark/`。
- `/status/` 页此前只有 class 没有对应 CSS，本版补齐整套 `.status-*` 规则。

## 4. 校验结果

| 项目 | 结果 |
| --- | --- |
| `npm test` | 234 通过 / 0 失败（新增 `tests/theme.test.ts` 6 例） |
| `npx tsc --noEmit -p .` | 无错误 |
| `astro build` | 169 个静态页面 |
| `validate-build` | 169 个页面、4374 个本地链接 / 资源，部署路径 `/yuanbao-model-rankings/` |
| 视觉回归 | 1440 与 390 两个宽度 × 浅色与深色两套主题，共 4 组整页截图 |

## 5. 已知边界

- 价格历史只有 18 个模型发生过核验到的变化，做不出“全站价格指数曲线”；要做必须有明确的加权口径，暂缓。
- Arena 综合文本榜发布于 2026-09-13，已超过 60 天。`/status/` 会一直标出这个日期，不掩盖。
- 4 家厂商（OpenAI、Anthropic、Google、xAI）仍是人工维护，价格靠人工按官方页更新，不能自动刷新核验时间。
- 深色下的分享图仍是浅色设计：Canvas 绘制用的是固定配色，没有跟随主题。
