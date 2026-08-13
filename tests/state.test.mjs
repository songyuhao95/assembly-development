// tests/state.test.mjs — 状态层：追加、重建确定性、冲突、幂等、并发完整性
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { appendEvent, readEvents } from '../scripts/lib/event-append.mjs';
import { rebuildProjections, RecoveryRequiredError } from '../scripts/state.mjs';
import { buildEnvelope } from '../scripts/snapshot.mjs';
import { canonicalize, contractHash } from '../scripts/identity.mjs';
import { createHash } from 'node:crypto';

const tmp = mkdtempSync(path.join(os.tmpdir(), 'asm-state-'));
const eventsPath = path.join(tmp, 'events.ndjson');

test('append/read 往返 + 崩溃残留尾行被忽略', () => {
  appendEvent(eventsPath, { schemaVersion: 1, eventId: 'a', at: 't', type: 'x', runId: 'r', payload: {} });
  appendEvent(eventsPath, { schemaVersion: 1, eventId: 'b', at: 't', type: 'y', runId: 'r', payload: {} });
  // 模拟崩溃残留：不完整尾行
  writeFileSync(eventsPath, '{"schemaVersion":1,"eventId":"c","at":"t","ty', { flag: 'a' });
  const events = readEvents(eventsPath);
  assert.equal(events.length, 2);
  assert.equal(events[1].eventId, 'b');
});

test('重建投影确定性：两次重建逐字节一致', () => {
  const p = path.join(tmp, 'det.ndjson');
  const seq = [
    { type: 'run.start', phase: 'new', taskId: null, payload: {} },
    { type: 'phase.enter', phase: 'implement', taskId: null, payload: { phase: 'implement' } },
    { type: 'task.assign', phase: 'implement', taskId: 'T-001', payload: { contractId: 'c1' } },
    { type: 'task.done', phase: 'implement', taskId: 'T-001', payload: { reportSha256: 'sha256:aa' } },
    { type: 'gate.approved', phase: 'plan', taskId: null, payload: { gate: 'G1', artifact: 'docs/x.md', sha256: 'sha256:g1', by: 'human' } },
    { type: 'risk.added', phase: 'plan', taskId: null, payload: { id: 'R-1', level: 'high', condition: 'c' } },
    { type: 'worktree.attach', phase: 'implement', taskId: 'T-001', payload: { path: '.worktrees/T-001', branch: 'task/x', base: 'sha256:b' } },
    { type: 'evidence.recorded', phase: 'verify', taskId: 'T-001', payload: { kind: 'test-result', path: 'run/reports/T-001.json', sha256: 'sha256:e', verdict: 'pass' } },
  ];
  for (let i = 0; i < seq.length; i++) {
    appendEvent(p, { schemaVersion: 1, eventId: `evt-${i}`, at: `2026-08-13T0${i}:00:00Z`, runId: 'run-x', phase: seq[i].phase, taskId: seq[i].taskId, contractId: null, agentId: null, actor: 'main', type: seq[i].type, payload: seq[i].payload });
  }
  const events = readEvents(p);
  const a = JSON.stringify(rebuildProjections(events));
  const b = JSON.stringify(rebuildProjections(events));
  assert.equal(a, b);
  const proj = rebuildProjections(events);
  assert.equal(proj.state.phase, 'implement');
  assert.equal(proj.state.taskStatuses['T-001'].status, 'done');
  assert.equal(proj.approvals.length, 1);
  assert.equal(proj.state.gateStates.G1, 'approved');
  assert.equal(proj.worktrees[0].status, 'attached');
});

test('相同 task.done 不同报告哈希 → RecoveryRequiredError', () => {
  const p = path.join(tmp, 'conflict.ndjson');
  const mk = (eventId, reportSha256) => ({ schemaVersion: 1, eventId, at: 't', type: 'task.done', runId: 'r', phase: 'implement', taskId: 'T-9', contractId: null, agentId: null, actor: 'main', payload: { reportSha256 } });
  appendEvent(p, mk('e1', 'sha256:aa'));
  appendEvent(p, mk('e2', 'sha256:bb'));
  assert.throws(() => rebuildProjections(readEvents(p)), RecoveryRequiredError);
});

test('重复 eventId 幂等跳过', () => {
  const p = path.join(tmp, 'dup.ndjson');
  const ev = { schemaVersion: 1, eventId: 'same', at: 't', type: 'task.done', runId: 'r', phase: 'implement', taskId: 'T-8', contractId: null, agentId: null, actor: 'main', payload: { reportSha256: 'sha256:aa' } };
  appendEvent(p, ev);
  appendEvent(p, ev);
  const proj = rebuildProjections(readEvents(p));
  assert.equal(proj.state.revision, 'same');
});

test('并发追加完整性：多进程各 50 条全部可读', () => {
  const p = path.join(tmp, 'concurrent.ndjson');
  const helper = path.join(tmp, 'append-helper.mjs');
  const libUrl = pathToFileURL(path.resolve('scripts/lib/event-append.mjs')).href;
  writeFileSync(helper, `
    import { appendEvent } from ${JSON.stringify(libUrl)};
    const p = ${JSON.stringify(p)};
    const who = process.argv[2];
    for (let i = 0; i < 50; i++) {
      appendEvent(p, { schemaVersion: 1, eventId: who + '-' + i, at: 't', type: 'x', runId: 'r', phase: null, taskId: null, contractId: null, agentId: null, actor: 'test', payload: { who, i } });
    }
  `);
  const children = [];
  for (let w = 0; w < 4; w++) {
    children.push(execFileSync(process.execPath, [helper, `w${w}`]));
  }
  const events = readEvents(p);
  assert.equal(events.length, 200);
  const ids = new Set(events.map((e) => e.eventId));
  assert.equal(ids.size, 200);
});

test('snapshot envelope：revision/runId/phase/stale 字段', () => {
  const p = path.join(tmp, 'snap.ndjson');
  appendEvent(p, { schemaVersion: 1, eventId: 'evt-last', at: 't', type: 'phase.enter', runId: 'run-s', phase: 'plan', taskId: null, contractId: null, agentId: null, actor: 'main', payload: { phase: 'plan' } });
  const envelope = buildEnvelope('run-s', readEvents(p));
  assert.equal(envelope.revision, 'evt-last');
  assert.equal(envelope.runId, 'run-s');
  assert.equal(envelope.phase, 'plan');
  assert.ok(envelope.staleAfterSeconds > 0);
  assert.equal(envelope.schemaVersion, 1);
});

test('规范化哈希：字段顺序无关、contract_sha256 被排除', () => {
  const a = { b: 1, a: { d: 2, c: 3 } };
  const b = { a: { c: 3, d: 2 }, b: 1 };
  const h1 = 'sha256:' + createHash('sha256').update(JSON.stringify(canonicalize(a))).digest('hex');
  const h2 = 'sha256:' + createHash('sha256').update(JSON.stringify(canonicalize(b))).digest('hex');
  assert.equal(h1, h2);
  const fm1 = { contract_sha256: 'sha256:x', name: 'c1', version: 1 };
  const fm2 = { version: 1, name: 'c1' };
  assert.equal(contractHash(fm1), contractHash(fm2));
});

test.after(() => {
  rmSync(tmp, { recursive: true, force: true });
});
