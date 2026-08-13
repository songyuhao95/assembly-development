// lib/event-append.mjs — 事件追加基础库
//
// 约定（见 docs/decisions/ADR-001 与 references/state-schema.md）：
// - 每行一个完整 JSON 事件，追加时一次写调用完成（O_APPEND）。
// - 单写者纪律：同一 run 的编排脚本串行追加；hooks 可能多进程并发，
//   但每次追加 <4KB，按 O_APPEND 单次系统调用写入，读端忽略不完整尾行。
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

export function appendEvent(eventsPath, event) {
  mkdirSync(dirname(eventsPath), { recursive: true });
  const line = JSON.stringify(event) + '\n';
  appendFileSync(eventsPath, line, { encoding: 'utf8', flag: 'a' });
}

// 读取事件流；忽略崩溃残留的不完整尾行；解析失败的行抛错（fail-closed）。
export function readEvents(eventsPath) {
  let text;
  try {
    text = readFileSync(eventsPath, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return [];
    throw err;
  }
  if (!text) return [];
  const lines = text.split('\n');
  const events = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;
    // 最后一行不完整（无结尾换行）→ 崩溃残留，忽略
    if (i === lines.length - 1 && !text.endsWith('\n')) continue;
    events.push(JSON.parse(line));
  }
  return events;
}
