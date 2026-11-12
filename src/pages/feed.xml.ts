import type { APIRoute } from 'astro';
import { catalog, verification } from '../lib/catalog';
import { money } from '../lib/ranking';
import { historySchema } from '../lib/pricing-metadata';
import historyData from '../data/price-history.json';

export const prerender = true;

const history = historySchema.parse(historyData);
const base = import.meta.env.BASE_URL;
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const iso = (value: string) => new Date(value).toISOString();

/**
 * Atom 订阅：每个模型只取最新一条事件，按发现时间倒序。
 * 这样订阅源既包含「新上架」，也包含「调价」，不会因为历史事件堆积而刷屏。
 */
export const GET: APIRoute = ({ site }) => {
  const origin = (site ?? new URL(import.meta.env.SITE ?? 'http://localhost:4321')).origin;
  const home = `${origin}${base}`;
  const entries = history.models
    .map(record => {
      const model = catalog.models.find(item => item.id === record.modelId);
      const event = record.events.reduce((latest, item) => (item.detectedAt > latest.detectedAt ? item : latest), record.events[0]);
      if (!model || !event) return null;
      const fx = model.currency === 'USD' ? catalog.meta.usdToCny : 1;
      const added = event.reason === 'initial_snapshot';
      const rate = event.rates[0];
      const detail = [
        `${added ? '新收录' : '费率变更'}：输入 ¥${money(rate.input * fx)} / 输出 ¥${money(rate.output * fx)} 每百万 Token`,
        event.rates.length > 1 ? `共 ${event.rates.length} 档阶梯，最高档输入上限 ${(event.rates.at(-1)!.upToInputTokens / 1000).toFixed(0)}K` : '',
        `货币 ${event.currency}${event.currency === 'USD' ? `，按 $1 = ¥${catalog.meta.usdToCny} 折算` : ''}`,
        verification.models[model.id]?.reason ?? '',
      ].filter(Boolean).join('；');
      return {
        id: `urn:yuanbao:${event.id}`,
        title: `${model.name}${added ? ' 上架' : ' 调价'}`,
        updated: iso(event.effectiveAt ?? event.detectedAt),
        link: `${origin}${base}models/${model.id}/`,
        summary: `${model.providerId} · ${detail}`,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => b.updated.localeCompare(a.updated))
    .slice(0, 40);

  const updated = entries[0]?.updated ?? iso(`${catalog.meta.updatedAt}T00:00:00Z`);
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="zh-CN">
  <title>源宝模型排行榜 · 上架与调价</title>
  <subtitle>主流 AI 模型官方 API 价格的新增与变动，按核验时间排序</subtitle>
  <link href="${home}" />
  <link rel="self" type="application/atom+xml" href="${origin}${base}feed.xml" />
  <id>urn:yuanbao:feed</id>
  <updated>${updated}</updated>
  <author><name>源宝</name><uri>${origin}${base}</uri></author>
${entries.map(entry => `  <entry>
    <title>${escape(entry.title)}</title>
    <link href="${entry.link}" />
    <id>${entry.id}</id>
    <updated>${entry.updated}</updated>
    <summary>${escape(entry.summary)}</summary>
  </entry>`).join('\n')}
</feed>
`;
  return new Response(xml, { headers: { 'Content-Type': 'application/atom+xml; charset=utf-8' } });
};
