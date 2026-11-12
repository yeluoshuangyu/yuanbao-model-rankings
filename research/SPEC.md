# 调研产出格式（每个厂商一个 JSON 文件）

目标：把「官方定价页当前在售的文本/多模态大模型」全部抓出来，供主流程合并进 `src/data/catalog.json`。

## 硬性规则

1. **只写页面上能看到的东西**。价格必须是官方定价页（或该厂商官方模型页）上的原文数字，不允许来自记忆、搜索摘要、第三方博客、汇率换算。
2. 页面上没有的信息填 `null`，**不要猜**。宁可缺字段，也不要编造。
3. 每个模型必须给 `evidence`：从页面抽出的原文片段（1-3 行），包含模型名与价格，用于事后核对。
4. 不包含：embedding、rerank、语音 TTS/STT、图像生成、视频生成、审核模型、纯 free 试用模型（除非页面明确给出正式 API 价格）。
5. 只收录 **文本/对话/推理/代码** 类模型（含多模态输入但按 token 计费的）。
6. 已经是 USD 的记 USD，人民币记 CNY，**不要换算**。
7. 阶梯计费（按输入长度分段）要完整列出所有档位，`upToInputTokens` 严格递增，最后一档等于该模型上下文上限。
8. 长上下文溢价（如 ≥200k 后价格翻倍）也算阶梯，单独一档。
9. `batchFactor`：页面给出 Batch/Flex 5 折就写 0.5，没写就 null。`offPeakFactor`：页面给出低峰/错峰折扣因子就写（如 0.5），否则 null。`cacheRead`：缓存命中读取价，没有就 null。
10. `promotion` 一律 null（限时活动不作为基础费率收录，写进 notes）。

## 输出 JSON 结构

写入 `research/<providerId>.json`：

```json
{
  "providerId": "openai",
  "sourceId": "openai-pricing",
  "sourceUrl": "https://developers.openai.com/api/docs/pricing",
  "retrievedAt": "2026-11-12",
  "notes": "页面口径说明，例如「价格为 Standard 档，Fast/Ultrafast 未收录」",
  "models": [
    {
      "id": "gpt-6-1-sol",
      "name": "GPT-6.1 Sol",
      "apiId": "gpt-6.1-sol",
      "status": "active",
      "region": "global",
      "regionLabel": "全球",
      "description": "一句话中文定位，例如「面向复杂推理与编程的旗舰模型」。",
      "useCases": ["chat", "code"],
      "contextTokens": 1050000,
      "contextScope": "combined",
      "maxInputTokens": null,
      "maxOutputTokens": 128000,
      "currency": "USD",
      "specSource": "https://developers.openai.com/api/docs/models/gpt-6.1-sol",
      "notes": ["标准费率为 Standard 档；Batch 为 5 折", "超过 200k 输入进入长上下文档"],
      "zeroPriceReason": null,
      "rates": [
        {
          "label": "输入不超过 200,000 Token",
          "upToInputTokens": 200000,
          "input": 2.0,
          "output": 10.0,
          "cacheRead": 0.1,
          "batchFactor": 0.5,
          "offPeakFactor": null,
          "promotion": null
        }
      ],
      "evidence": "gpt-6.1-sol | $2.00 | $10.00 | $0.10"
    }
  ]
}
```

## 字段口径

- `status`：`active` 正式可用 / `preview` 预览版或 beta / `deprecated` 仅存量（页面写「即将下线/停止新购」）/ `retired` 已下架（页面明确 retired 或迁移公告）。
- `region`：`mainland`（中国大陆） / `global`（全球） / `us`（美国） / `singapore`（新加坡）。中国厂商默认 `mainland`，区域差异单独建条目时用 `-singapore` 之类后缀并写清 `regionLabel`。
- `contextScope`：`combined` 表示输入+输出共享上下文；`input` 表示只限输入长度。
- `useCases`：从 `chat` / `long` / `code` 里选 1-3 个。
- `id`：小写、连字符，版本号用连字符（`gpt-6-1-sol`、`claude-opus-5-5`）。
- `sourceId` 用给你的那个值，不要自造。

## 工作方式

- 用 `curl -sSL --compressed` 抓页面，再用 python 去标签抽文本；很多文档站是 SPA，注意找 `__NEXT_DATA__`、`llms.txt`、`*.md` 版本（`platform.kimi.com/docs/pricing/chat.md`、`docs.bigmodel.cn/.../pricing.md` 这类直接给 markdown 的最省事）。
- 抽完先自查：每个价格都能在 `evidence` 里找到；档位递增；币种正确。
- 最后只写文件，不要改 `src/data/`。
