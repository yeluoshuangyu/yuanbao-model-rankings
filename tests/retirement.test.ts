import test from 'node:test';
import assert from 'node:assert/strict';
import { catalog } from '../src/lib/catalog';
import { defaultFilters } from '../src/lib/ranking';
import { countdown, imminentRetirements, retirements } from '../src/lib/retirement';

const at = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

test('倒计时按剩余天数换文案与语气', () => {
  const now = at('2026-11-12');
  assert.equal(countdown('2026-11-12', now).label, '今天下线');
  assert.equal(countdown('2026-11-12', now).tone, 'soon');
  assert.equal(countdown('2026-11-15', now).label, '3 天后下线');
  assert.equal(countdown('2026-11-15', now).tone, 'soon');
  assert.equal(countdown('2026-11-30', now).label, '距下线 18 天');
  assert.equal(countdown('2026-11-30', now).tone, 'calm');
  assert.equal(countdown('2026-11-01', now).tone, 'past');
  assert.match(countdown('2026-11-01', now).label, /已过/);
});

test('下线时间表按日期升序，且只收标了 retireAt 的型号', () => {
  const rows = retirements(catalog, defaultFilters, 1000, at('2026-11-12'));
  assert.ok(rows.length >= 6);
  const dates = rows.map(row => row.model.retireAt!);
  assert.deepEqual(dates, [...dates].sort());
  for (const row of rows) {
    assert.ok(row.model.status === 'deprecated' || row.model.status === 'retired');
    assert.ok(row.monthly > 0);
  }
  assert.ok(rows.some(row => row.model.id === 'minimax-m2-7' && row.countdown.days === 6));
});

test('60 天内的临近下线单独可查', () => {
  const soon = imminentRetirements(catalog, at('2026-11-12'), 60);
  assert.ok(soon.size >= 6);
  assert.ok([...soon.values()].every(left => left.days <= 60));
  // 已过公告日期的型号不再提示，那是数据复核信号而不是倒计时
  assert.equal(imminentRetirements(catalog, at('2027-01-05'), 60).size, 0);
  assert.ok(imminentRetirements(catalog, at('2026-11-12'), 7).size >= 1);
});
