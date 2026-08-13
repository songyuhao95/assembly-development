// tests/dashboard-ui.test.mjs — 看板前端纯函数单测（T-001：相对时间分档 + stale 判定 + 304 语义 + 静态锁定）
// 全部注入 nowMs，无时钟竞态、确定性；无新依赖（node:test + node:assert 内置）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { formatRelative, formatAbsolute, renderTimeText, computeStale } from '../dashboard/app.js';

const NOW = Date.parse('2026-08-13T10:00:00.000Z'); // 固定基准，避免时区/时钟影响
const at = (epochMs) => new Date(epochMs).toISOString();

test('分档边界：<60s 刚刚 / <60min N 分钟前 / <24h N 小时前 / ≥24h → null', () => {
  // <60s
  assert.equal(formatRelative(NOW, NOW), '刚刚');                          // 0ms
  assert.equal(formatRelative(NOW, NOW - 59_999), '刚刚');                 // 59.999s → 刚刚
  assert.equal(formatRelative(NOW, NOW - 60_000), '1 分钟前');             // 恰 60s → 下一档
  assert.equal(formatRelative(NOW, NOW - 61_000), '1 分钟前');             // 61s → floor(61s/60s)=1
  // <60min
  assert.equal(formatRelative(NOW, NOW - 59 * 60_000), '59 分钟前');       // 59min
  assert.equal(formatRelative(NOW, NOW - 3_600_000), '1 小时前');          // 恰 60min → 下一档
  // <24h
  assert.equal(formatRelative(NOW, NOW - (23 * 3_600_000 + 59 * 60_000)), '23 小时前'); // 23h59m
  assert.equal(formatRelative(NOW, NOW - 86_400_000), null);               // ≥24h → null（调用方走绝对时间）
});

test('负值/非有限值 clamp 为 0 →「刚刚」', () => {
  assert.equal(formatRelative(NOW, NOW + 1_000), '刚刚'); // thenMs 在未来（时钟偏差）
  assert.equal(formatRelative(NOW - 1_000, NOW), '刚刚'); // nowMs 在过去
  assert.equal(formatRelative(NaN, 0), '刚刚');           // 非有限
  assert.equal(formatRelative(Infinity, 0), '刚刚');
  assert.equal(formatRelative(0, Infinity), '刚刚');
});

test('绝对时间格式 MM-DD HH:MM（本地时区，两位补零）', () => {
  assert.equal(formatAbsolute(new Date(2026, 0, 5, 9, 7)), '01-05 09:07');
  assert.equal(formatAbsolute(new Date(2026, 11, 31, 23, 59)), '12-31 23:59');
  assert.match(formatAbsolute(new Date()), /^\d{2}-\d{2} \d{2}:\d{2}$/); // 任意本地日期，避免时区脆断
});

test('renderTimeText：相对/绝对路由与畸形 ISO 原文兜底', () => {
  assert.equal(renderTimeText(at(NOW - 30_000), NOW), '刚刚');                                        // 过去 30s
  assert.equal(renderTimeText(at(NOW - 5 * 60_000), NOW), '5 分钟前');                                // 过去 5min
  assert.match(renderTimeText(at(NOW - 30 * 3_600_000), NOW), /^\d{2}-\d{2} \d{2}:\d{2}$/);           // 过去 30h → 绝对
  assert.equal(renderTimeText('not-a-date', NOW), 'not-a-date');                                       // 畸形 → 原文兜底
});

test('stale 边界（锁定现状语义：严格 > 才算 stale）', () => {
  assert.equal(computeStale(at(NOW - 31_000), NOW, 30), true);  // 31s > 30s → stale
  assert.equal(computeStale(at(NOW - 30_000), NOW, 30), false); // 恰 30s：现状 > 语义 → 非 stale
  assert.equal(computeStale(at(NOW - 29_000), NOW, 30), false); // 29s → 非 stale
  assert.equal(computeStale(at(NOW - 31_000), NOW, undefined), true); // 缺 staleAfterSeconds → 默认 30s
  assert.equal(computeStale('garbage', NOW, 30), false);        // 畸形 generatedAt → 非 stale
  assert.equal(computeStale(null, NOW, 30), false);             // null → 非 stale
  assert.equal(computeStale(undefined, NOW, 30), false);
});

test('304 更新语义（纯函数层面）：304 分支视为轮询完成，新鲜性由 generatedAt 决定', () => {
  // 304 = 内容未变：新鲜快照 → 非 stale（不显示过期横幅）
  assert.equal(computeStale(at(NOW - 5_000), NOW, 30), false);
  // 304 且快照已超时 → 仍 stale（现状 304 分支过期横幅语义保留）
  assert.equal(computeStale(at(NOW - 31_000), NOW, 30), true);
  // 轮询完成（200/304）即刻刷新指示相对时间 =「刚刚」
  assert.equal(formatRelative(NOW, NOW), '刚刚');
  // 指示随 30s tick 重算：5 分钟后 →「5 分钟前」（刷新于语义）
  assert.equal(formatRelative(NOW + 5 * 60_000, NOW), '5 分钟前');
});

test('静态断言：module 转换 + 刷新指示元素 + document 守卫不被移除', () => {
  const html = readFileSync(new URL('../dashboard/index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('<script type="module" src="/app.js">'));
  assert.ok(html.includes('id="refresh-indicator"'));
  assert.ok(html.includes('id="refresh-at"'));
  const app = readFileSync(new URL('../dashboard/app.js', import.meta.url), 'utf8');
  assert.ok(app.includes("typeof document !== 'undefined'"));
});
