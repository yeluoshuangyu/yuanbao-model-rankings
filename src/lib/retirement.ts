import type { Catalog, Model } from './schema';
import type { Filters } from './ranking';
import { quote } from './ranking';

export type Countdown = {
  /** 距离下线还有多少天；负数表示已经过了公告日期 */
  days: number;
  label: string;
  tone: 'calm' | 'soon' | 'past';
};

const DAY = 86_400_000;

function startOfDay(value: string | Date): number {
  const date = typeof value === 'string' ? new Date(`${value}T00:00:00Z`) : value;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * 按官方公告的下线日期算倒计时。7 天内用警示色，已经过了公告日期但模型还在表里时
 * 说明数据该复核了，文案直接写"已过公告下线日"，不做推测。
 */
export function countdown(retireAt: string, now: string | Date = new Date()): Countdown {
  const days = Math.round((startOfDay(retireAt) - startOfDay(now)) / DAY);
  if (days < 0) return { days, label: '已过公告下线日', tone: 'past' };
  if (days === 0) return { days, label: '今天下线', tone: 'soon' };
  if (days <= 7) return { days, label: `${days} 天后下线`, tone: 'soon' };
  return { days, label: `距下线 ${days} 天`, tone: 'calm' };
}

export type Retirement = {
  model: Model;
  providerId: string;
  retireAt: string;
  countdown: Countdown;
  /** 按当前筛选口径折算的每月成本，拿不到报价时为 null */
  monthly: number | null;
};

/**
 * 所有标注了下线日期的型号，按日期升序。已经过期的排前面：那是"该去复核数据"的信号。
 */
export function retirements(catalog: Catalog, filters: Filters, daily = 1000, today: Date | string = new Date()): Retirement[] {
  const iso = typeof today === 'string' ? today : today.toISOString().slice(0, 10);
  return catalog.models
    .filter(model => model.retireAt && (model.status === 'deprecated' || model.status === 'retired'))
    .map(model => {
      const priced = quote(model, filters, filters.fx ?? catalog.meta.usdToCny, iso);
      return {
        model,
        providerId: model.providerId,
        retireAt: model.retireAt!,
        countdown: countdown(model.retireAt!, today),
        monthly: priced ? priced.task * daily * 30 : null,
      };
    })
    .sort((a, b) => a.retireAt.localeCompare(b.retireAt) || a.model.name.localeCompare(b.model.name));
}

/** 只保留最近要下线的若干款，给榜单行内提示用 */
export function imminentRetirements(catalog: Catalog, today = new Date(), withinDays = 60): Map<string, Countdown> {
  const map = new Map<string, Countdown>();
  for (const model of catalog.models) {
    if (!model.retireAt) continue;
    const left = countdown(model.retireAt, today);
    if (left.days >= 0 && left.days <= withinDays) map.set(model.id, left);
  }
  return map;
}
