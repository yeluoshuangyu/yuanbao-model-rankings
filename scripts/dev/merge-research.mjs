// 把 research/<providerId>.json（人工/子代理调研产出）合并进 src/data/：
//   catalog.json      新增模型、更新变动费率
//   price-history.json 追加 initial_snapshot / price_change 事件
//   verification.json  写入人工核验记录
// 用法：node scripts/dev/merge-research.mjs [--provider=xai] [--dry]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const DATA = path.join(ROOT, 'src/data');
const RESEARCH = path.join(ROOT, 'research');
const args = process.argv.slice(2);
const only = args.find(a => a.startsWith('--provider='))?.split('=')[1];
const dry = args.includes('--dry');

const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const writeJson = (f, o) => fs.writeFileSync(f, `${JSON.stringify(o, null, 2)}\n`);

const catalog = readJson(path.join(DATA, 'catalog.json'));
const history = readJson(path.join(DATA, 'price-history.json'));
const verification = readJson(path.join(DATA, 'verification.json'));

const nowIso = new Date().toISOString();
const today = nowIso.slice(0, 10);

const OFFICIAL = {
  openai: ['openai.com'],
  anthropic: ['anthropic.com', 'claude.com'],
  google: ['ai.google.dev'],
  xai: ['x.ai'],
  deepseek: ['deepseek.com'],
  bytedance: ['volcengine.com'],
  alibaba: ['aliyun.com'],
  moonshot: ['moonshot.cn', 'moonshot.ai', 'kimi.com', 'kimi.ai'],
  zhipu: ['bigmodel.cn'],
  minimax: ['minimaxi.com', 'minimax.cn', 'minimax.io'],
  baidu: ['cloud.baidu.com', 'ai.baidu.com'],
  tencent: ['cloud.tencent.com', 'cloud.tencent.cn'],
};
const REGION_DEFAULT = {
  openai: ['global', '全球标准 API'],
  anthropic: ['global', '全球标准 API'],
  google: ['global', '全球标准 API'],
  xai: ['us', '美国 · 全球端点'],
};
const NUMBER_FIELDS = ['upToInputTokens', 'input', 'output', 'cacheRead', 'batchFactor', 'offPeakFactor'];

const isOfficial = (url, providerId) => {
  if (!url) return false;
  for (const domain of OFFICIAL[providerId] ?? []) {
    if (new URL(url).hostname === domain || new URL(url).hostname.endsWith(`.${domain}`)) return true;
  }
  return false;
};
const hex24 = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 24);
const thousands = n => n.toLocaleString('en-US');

const normalizeRates = (rates, modelId) => rates
  .map(rate => ({
    label: rate.label?.trim() || `输入不超过 ${thousands(rate.upToInputTokens)} Token`,
    upToInputTokens: rate.upToInputTokens,
    input: rate.input,
    output: rate.output,
    cacheRead: rate.cacheRead ?? null,
    batchFactor: rate.batchFactor ?? null,
    offPeakFactor: rate.offPeakFactor ?? null,
    promotion: rate.promotion ?? null,
  }))
  .sort((a, b) => a.upToInputTokens - b.upToInputTokens);

const fingerprint = rates => JSON.stringify(rates.map(r => NUMBER_FIELDS.map(f => r[f] ?? null)));

const changedTypes = (prev, next) => {
  const types = [];
  if (prev.length !== next.length) types.push('tier_change');
  const a = prev.at(-1);
  const b = next.at(-1);
  if (a && b) {
    if (a.input !== b.input) types.push('input_price');
    if (a.output !== b.output) types.push('output_price');
    if ((a.cacheRead ?? null) !== (b.cacheRead ?? null)) types.push('cache_read_price');
    if ((a.batchFactor ?? null) !== (b.batchFactor ?? null)) types.push('batch_factor');
    if ((a.offPeakFactor ?? null) !== (b.offPeakFactor ?? null)) types.push('off_peak_factor');
  }
  return types.length ? types : ['tier_change'];
};

const stats = { added: [], updated: [], unchanged: [], skipped: [] };
const files = fs.readdirSync(RESEARCH)
  .filter(name => name.endsWith('.json') && !name.startsWith('_'))
  .filter(name => !only || path.basename(name, '.json') === only);

for (const file of files) {
  const spec = readJson(path.join(RESEARCH, file));
  const providerId = spec.providerId;
  if (!catalog.providers.some(p => p.id === providerId)) {
    stats.skipped.push(`${file}: 未知厂商 ${providerId}`);
    continue;
  }

  let source = catalog.sources.find(s => s.id === spec.sourceId);
  if (!source) {
    source = {
      id: spec.sourceId,
      providerId,
      title: `${providerId} 官方定价页`,
      url: spec.sourceUrl,
      retrieval: 'page',
      notes: spec.notes ?? '官方定价页。',
    };
    catalog.sources.push(source);
  } else {
    source.url = spec.sourceUrl;
    source.retrieval = 'page';
    source.notes = spec.notes ?? source.notes;
  }

  for (const raw of spec.models ?? []) {
    const rates = normalizeRates(raw.rates ?? []);
    if (!rates.length) { stats.skipped.push(`${raw.id ?? raw.apiId}: 无费率`); continue; }
    for (let i = 1; i < rates.length; i += 1) {
      if (rates[i].upToInputTokens <= rates[i - 1].upToInputTokens) {
        stats.skipped.push(`${raw.id}: 阶梯未严格递增`);
      }
    }
    if (rates.some(r => r.input < 0 || r.output < 0)) {
      stats.skipped.push(`${raw.id}: 价格异常`);
      continue;
    }
    const zeroPriced = rates.some(r => r.input === 0 || r.output === 0);
    const zeroPriceReason = raw.zeroPriceReason ?? (zeroPriced ? '官方定价为 0，免费开放。' : null);

    const existing = catalog.models.find(m => m.id === raw.id)
      ?? catalog.models.find(m => m.providerId === providerId && m.apiId?.toLowerCase() === String(raw.apiId ?? '').toLowerCase());

    const baseFields = {
      description: raw.description,
      useCases: raw.useCases?.length ? raw.useCases : ['chat'],
      contextTokens: raw.contextTokens ?? null,
      contextScope: raw.contextScope ?? 'combined',
      ...(raw.maxInputTokens ? { maxInputTokens: raw.maxInputTokens } : {}),
      maxOutputTokens: raw.maxOutputTokens ?? null,
      notes: raw.notes ?? [],
      zeroPriceReason,
    };

    if (existing) {
      const previousRates = existing.rates;
      const before = fingerprint(previousRates);
      const after = fingerprint(rates);
      const specSource = isOfficial(raw.specSource, providerId) ? raw.specSource : existing.specSource ?? null;
      Object.assign(existing, {
        ...baseFields,
        currency: raw.currency ?? existing.currency,
        specSource,
        verifiedAt: today,
        rates,
      });
      let entry = history.models.find(m => m.modelId === existing.id);
      if (!entry) {
        entry = { modelId: existing.id, providerId, events: [] };
        history.models.push(entry);
      }
      if (before !== after) {
        entry.events.push({
          id: hex24([existing.id, rates, nowIso]),
          detectedAt: nowIso,
          effectiveAt: null,
          currency: existing.currency,
          rates: existing.rates,
          sourceUrl: spec.sourceUrl,
          reason: entry.events.length ? 'price_change' : 'initial_snapshot',
          verification: 'manual_verified',
          changeTypes: entry.events.length ? changedTypes(previousRates, rates) : [],
        });
        stats.updated.push(`${existing.id}（${existing.providerId}）`);
      } else {
        stats.unchanged.push(existing.id);
      }
      verification.models[existing.id] = {
        status: existing.status === 'retired' ? 'deprecated' : 'fresh',
        lastCheckedAt: nowIso,
        lastSuccessAt: nowIso,
        verification: 'manual_verified',
        reason: `人工核对官方定价页（${spec.sourceUrl}）`,
      };
      continue;
    }

    const [region, regionLabel] = REGION_DEFAULT[providerId] ?? ['mainland', '中国大陆'];
    const model = {
      id: raw.id,
      name: raw.name ?? raw.id,
      apiId: raw.apiId ?? raw.id,
      providerId,
      status: raw.status ?? 'active',
      region: raw.region ?? region,
      regionLabel: raw.regionLabel ?? regionLabel,
      ...baseFields,
      currency: raw.currency ?? 'CNY',
      sourceId: source.id,
      specSource: isOfficial(raw.specSource, providerId) ? raw.specSource : null,
      verifiedAt: today,
      rates,
    };
    catalog.models.push(model);
    history.models.push({
      modelId: model.id,
      providerId,
      events: [{
        id: hex24([model.id, rates, nowIso]),
        detectedAt: nowIso,
        effectiveAt: null,
        currency: model.currency,
        rates: model.rates,
        sourceUrl: spec.sourceUrl,
        reason: 'initial_snapshot',
        verification: 'manual_verified',
        changeTypes: [],
      }],
    });
    verification.models[model.id] = {
      status: model.status === 'retired' ? 'deprecated' : 'fresh',
      lastCheckedAt: nowIso,
      lastSuccessAt: nowIso,
      verification: 'manual_verified',
      reason: `人工核对官方定价页（${spec.sourceUrl}）`,
    };
    stats.added.push(`${model.id}（${providerId}）`);
  }

  verification.providers[providerId] = {
    status: 'fresh',
    lastCheckedAt: nowIso,
    lastSuccessAt: nowIso,
    verification: 'manual_verified',
    reason: `人工核对官方定价页（${spec.sourceUrl}）`,
  };
}

// 归一化：历史事件按 detectedAt 升序
for (const entry of history.models) entry.events.sort((a, b) => a.detectedAt.localeCompare(b.detectedAt));

catalog.meta.updatedAt = today;
verification.checkedAt = nowIso;

console.log(`新增 ${stats.added.length}：${stats.added.join('、') || '无'}`);
console.log(`改价 ${stats.updated.length}：${stats.updated.join('、') || '无'}`);
console.log(`未变 ${stats.unchanged.length}：${stats.unchanged.join('、') || '无'}`);
if (stats.skipped.length) console.log(`跳过：\n - ${stats.skipped.join('\n - ')}`);
console.log(`合计模型 ${catalog.models.length} 个`);

if (!dry) {
  writeJson(path.join(DATA, 'catalog.json'), catalog);
  writeJson(path.join(DATA, 'price-history.json'), history);
  writeJson(path.join(DATA, 'verification.json'), verification);
  console.log('已写入 src/data/');
}
