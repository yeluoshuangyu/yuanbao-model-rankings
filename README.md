# 源宝模型排行榜

中文主流 AI 模型价格、性能与鹈鹕作品榜。Astro + TypeScript + 静态 JSON，仅依赖 GitHub Repository / Actions / Pages。

代码与整理数据以 [MIT 许可](LICENSE) 开放；厂商品牌图形与各模型生成的原始作品不在此授权内（详见许可证末尾）。

当前产品基线：[PRD v3.2](PRD.md)。本次迭代说明：[v3.2 发布说明](docs/RELEASE-v3.2.md)；上一版：[v3.1 发布说明](docs/RELEASE-v3.1.md)、[v3.0 验收记录](docs/RELEASE-v3.0.md)、[9 月 14 日自动更新修复记录](docs/WORKFLOW-FIX-2026-09-14.md)。

## 当前功能

导航里有六个页面：价格排行榜、性价比、模型对比、性能排行榜、大模型科目三、开放数据。另有不占导航位的数据状态页 `/status/`，以及给外部用的徽章、Atom 订阅、sitemap 与 robots。

- 价格排行榜：12 家厂商、161 条费率与永久详情，默认显示 152 条。输入、输出、任务成本排序；筛选、场景用量、自定义计算、优惠选项、分享与 URL 恢复。
- 首页也做决策工具：最近上架 / 最近调价两张卡、按当前筛选的月账单估算、可改汇率（默认 $1 = ¥7.00）、模型收藏（localStorage）与「只看我的收藏」、下载榜单分享图（Canvas 导出 PNG）。
- 性价比：Arena 分 × 价格散点图（内联 SVG，无图表库），标出帕累托前沿，并列出前沿模型表；文本、编程、视觉三张榜分开画，不与智能体榜混用分数。
- 模型对比：勾选 2–4 款并排比较阶梯价、缓存、上下文、三种场景单次成本与性能分，对比清单写进 URL 可直接分享。
- 详情页：原币阶梯表、价格走势折线（单条记录时改画阶梯图）、场景计算器、迁移计算器（按月账单列出更省/更贵的同类模型）。
- 性能：综合文本 241、网页编程 103、视觉理解 113、智能体 36 条模型/配置记录。各自保留官方指标、日期、名次，不跨分类拼分。
- 开放数据：`/data/*.json` 与 `/data/models.csv` 五个端点的字段说明和示例；CSV 共 22 列，含人民币换算与任务成本。
- 对外引用：`/badge/<id>.svg` 价格徽章、`/feed.xml` 上架与调价订阅、`/sitemap.xml`、`/robots.txt`。
- 数据状态 `/status/`：核验方式、分厂商最后核验与距今天数、沿用旧价的型号与原因、外部成绩榜日期；超过 7 天未核验与超过 30 天的榜单用警示色标出。
- 大模型科目三：17 份 HTML 原作，按源宝人工总分从高到低展示，同分并列，左侧竖线从夯到拉。五项各 2 分，总分 10 分，可展开明细；保留小窗预览、放大、下载、筛选和分享，不显示 GIF 或测试记录。
- 深色模式：右上角一键切换，选择存进 localStorage 并跨页保持；没选过时跟随系统 `prefers-color-scheme`。全站颜色走 CSS 变量（`src/styles/theme.css`），内联 SVG 图表、厂商 Logo 底板、代码块与状态徽章都有对应的深色值。
- 统一彩色厂商 Logo、冠军卡、桌面/手机布局和社区页脚。标志资源及许可见 [Logo 说明](public/logos/README.md)。
- 价格自动更新、异常审核、追加历史及 Pages 自动构建发布；覆盖与失败边界见下文。

价格数量为 2026-11-12 逐条核对官方定价页后的快照；性能数量为 2026-09-14 自动更新后的快照；科目三数量更新至 2026-09-23。性能记录包含不同配置，不能相加作为独立型号数。历史 v2 文件仅用于追溯，不覆盖当前 PRD。

## 本地开发与校验

需要 Node.js 22.12+。

```bash
npm ci
npm run dev
# 完整校验
npm run validate:workflows
npm test
npm run build
npm run validate:build
```

视觉回归快照（需要本机装 Chrome/Chromium/Edge）：

```bash
npm run snap                        # 生成 .shots/*.html（自包含，可直接打开）
npm run snap -- --shot              # 顺便截 1440px 整页 PNG 到 .shots/shots-1440/
npm run snap -- --shot --width=390  # 手机宽度（真 390px 视口，见下）
npm run snap -- --shot --theme=dark # 深色模式，落到 .shots/shots-<width>-dark/
npm run snap -- --shot --only=home,value --chrome=/path/to/chrome
```

快照会剥离脚本、内联 CSS，并用同一批 `src/lib` 函数把客户端渲染的区块（月账单、对比表、迁移表）预先填好；分享图是 Canvas 绘制的，所以额外用 esbuild 打包一份真实渲染出来。找不到 Chrome 时只出 HTML、不报错。

截图走 Chrome DevTools Protocol 的 `Emulation.setDeviceMetricsOverride`，而不是 `--window-size`：Chrome 的窗口最小宽度被钳在 500px，`--window-size=390` 实际渲染的是 500px 再裁切，`@media (max-width: 480px)` 根本不会命中。窄屏（< 600px）会以 2 倍像素密度出图，方便看细节。

项目子路径校验：

```bash
SITE_URL=https://yeluoshuangyu.github.io BASE_PATH=/yuanbao-model-rankings/ npm run build
BASE_PATH=/yuanbao-model-rankings/ npm run validate:build
```

受限环境可设置 `ASTRO_TELEMETRY_DISABLED=1`。`.env`、`outputs/`、`.artifact-work/` 和 `reports/` 不进入公开仓库。

## 数据与目录

| 文件/目录 | 用途 |
| --- | --- |
| `src/data/catalog.json` | 官方原币费率、12 家厂商白名单、来源、模型规格 |
| `src/data/exchange-rates.json` | 独立参考汇率，目前 $1 = ¥7.00，非实时外汇报价 |
| `src/data/verification.json` | 与价格快照对应的核验状态 |
| `src/data/price-history.json` | 追加式历史，当前 161 模型 / 179 事件 |
| `src/data/performance*.json` | 四个独立性能分类快照 |
| `data/performance/` | 性能历史及来源配置 |
| `src/data/pelican.json` | 白猫作品、历史 AI 评分、原作引用及核验状态 |
| `data/pelican/manual-scores-*.json` | 源宝回传的 10 分制人工评分与源表追溯信息 |
| `src/lib/`、`src/scripts/` | 校验、计价、排序与页面交互；`render.ts` 同构渲染，服务端与客户端共用 |
| `src/pages/data/*.ts` | 静态 JSON 与 CSV 端点（`prerender = true`） |
| `research/` | 逐家厂商的调研产出，含官网原文证据 |
| `scripts/providers/`、`scripts/pricing/` | 独立厂商 Adapter、安全门槛、历史与事务 |
| `.github/workflows/` | CI、Pages、价格和性能更新 |

零输入/输出价不参与价格排名，未知价不填 0，退役模型保留 URL。抓取失败保留有效旧价，并展示状态；超过 7 天未成功核验会提示。缓存、Batch、低峰和促销必须明确选择，不自动叠加；请求超出窗口或缺对应阶梯不外推。

## GitHub Pages 发布

1. 默认分支为 `main`，Pages 来源为 **GitHub Actions**。
2. `deploy.yml` 在 `main` 推送或手动触发时执行测试、Build、产物校验与 Pages 部署。域名、子路径使用 `configure-pages` 的输出。
3. 默认通过运行报告和精确变更 ID 人工审核。审核 PR 功能保留但首次发布不启用；只有维护者确认所需仓库权限并将 Actions 变量 `ENABLE_PRICE_REVIEW_PRS` 设为 `true` 后才运行该 job。
4. 普通发布、价格和性能更新共用发布互斥组。检查或 Build 失败不部署；自动数据更新在部署成功后才推送数据提交。

无需购买域名或服务器。大陆多地区、多运营商的实际可用性仍需测试；不承诺全国稳定访问。

## 价格更新和人工审核

**Update official prices** 每 6 小时运行，也可在 Actions → Run workflow 手动运行；`provider` 留空检查全部，或填写单个厂商 ID。

```bash
# 真实抓取和报告，不修改生产数据
npm run prices:update
npm run prices:update -- --provider=deepseek
# 抓取、判定、暂存、测试及 Build；本地不会 commit/push
npm run prices:update -- --apply
```

自动 Adapter 共 8 家：DeepSeek、豆包、千问、Kimi、智谱、MiniMax、百度、腾讯。智谱免费型号及 MiniMax 未匹配型号仍需人工处理。

人工维护 4 家：OpenAI（直连 403）、Anthropic（地区跳转）、Google（超时、解析未验证）、xAI（超时、长输入条件未完整适配）。这些是当前适配限制，不能据此断言官网一直不可访问，也不能声称全量自动更新已成功。

安全阈值位于 `scripts/pricing/policy.json`：任一核心价格变化 >60% 或降至旧价 <20% 进入审核；零标准价、字段缺失或错误计费列直接阻止；同厂商超过一半模型异常则保留整家旧值。

处理审核：

1. 查看 Workflow Summary、`pricing-review` artifact 或 `codex/pricing-review` PR，核对旧值、新值、单位、地区、阶梯及官方来源。
2. 对可审核且证据完整的条目，在 Run workflow 的 `approve_change_ids` 填精确 ID，多个以逗号分隔。
3. 工作流重新抓取，候选或旧数据改变后原 ID 无效；`blocked`、缺字段或不完整新模型不能用 ID 强行放行。
4. 审核 PR 只保存报告，合并它不会发布异常价格。

`attention` job 将待审核候选显示为 warning，不再把已知人工待办算作任务失败。人工 Adapter 本轮不运行自动抓取，也不刷新模型核验日期。真正的自动抓取故障仍使任务失败，测试、构建和部署失败也继续报错；异常价格仍被拦住并保留报告，未放宽数据校验。

无语义价格变化时不创建价格 commit、不重复历史。每轮状态保存在 90 天 `pricing-run-state` artifact，只有价格快照哈希匹配才恢复；普通部署也恢复匹配状态。事务校验/测试/构建失败，本地入口还原生产文件。

## 人工维护或新增型号

核对官方原币、标准列、完整阶梯和地区后编辑数据，并记录真实核验：

```bash
npm run prices:record-manual -- --model=模型ID --source=https://厂商官方定价地址 --reason='已核对标准价格、地区及完整阶梯'
npm test
npm run build
```

直接修改价格而不更新历史会被校验阻止。退役模型标记 `retired`，不要删除历史。已核对的新型号可用 `prices:add-reviewed -- --apply --from-file=文件路径` 原子导入，重复导入不写文件。

新增 Adapter 时实现 `fetch / parse / validate`，返回 `NormalizedPrice`，采用公开的厂商官方源；补充最小解析 Fixture 和边界测试，完成真实读取验证后才标记 `automatic`。不能用搜索摘要或旧价补齐解析失败字段。

## 性能与鹈鹕维护

性能 **Update Arena performance leaderboard** 每 6 小时尝试更新，也可手动触发。`npm run performance:update` 默认只出报告，追加 `--apply` 才进入更新事务。文本数据集失败时独立读取完整 Arena 官方文本页，两者不拼接；每个来源均需通过完整性、身份、日期和分数变化校验。失败分类保留旧快照并报错；通过校验的分类仍可发布并追加历史。2026-09-14 实跑已成功检查四类榜单、更新文本与视觉、完成 Pages 部署；具体日期与证据见[修复记录](docs/WORKFLOW-FIX-2026-09-14.md)。

大模型科目三采用[白猫骑车统一提示词](docs/鹈鹕测试_统一提示词_v3.0.txt)：每款只生成一次，最高可设置档，不能设置时默认。2026-09-15 收到首批人工评分，2026-09-23 新增 Claude Opus 5.5（8 分）、GPT-6 Sol（7 分）、GPT-6 Luna（4 分），按五项之和降序排列，同分保持提交顺序。左侧连续竖线表示从夯到拉；小窗展示 HTML，点击打开大弹窗。原件与历史 AI 评分保留，当前排名只使用新的人工成绩。维护方式见[大模型科目三说明](docs/PELICAN-BOARD.md)。
