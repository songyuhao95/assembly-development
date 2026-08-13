// tests/hooks.test.mjs — hook 脚本：pretool 阻断、事件记录、subagent 报告缺口风险
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readEvents } from '../scripts/lib/event-append.mjs';

const tmp = mkdtempSync(path.join(os.tmpdir(), 'asm-hooks-'));
const runDir = path.join(tmp, 'run');
const hook = (name, payload, env = {}) =>
  spawnSync(process.execPath, [path.resolve('scripts/hooks', name)], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, ASM_RUN_DIR: runDir, ...env },
  });

test('pretool：危险命令 exit 2（无论是否有活动 run）', () => {
  const bad = ['git init', 'git  init myproj', 'git reset --hard HEAD', 'git clean -fd', 'git push origin main --force', 'rm -rf .git'];
  for (const cmd of bad) {
    const r = hook('hook-pretool.mjs', { tool_input: { command: cmd } });
    assert.equal(r.status, 2, `expected deny for: ${cmd}`);
  }
  const ok = ['git status', 'git commit -m "x"', 'npm run test'];
  for (const cmd of ok) {
    const r = hook('hook-pretool.mjs', { tool_input: { command: cmd } });
    assert.equal(r.status, 0, `expected allow for: ${cmd}`);
  }
});

test('无活动 run：session-start/stop 不写事件', () => {
  hook('hook-session-start.mjs', {});
  assert.equal(readEvents(path.join(runDir, 'events.ndjson')).length, 0);
});

test('有活动 run：session.start / user.prompt / turn.stop 写入事件', () => {
  mkdirSync(path.join(runDir, '.runtime'), { recursive: true });
  writeFileSync(path.join(runDir, '.runtime', 'active-run.json'), JSON.stringify({ runId: 'run-h', startedAt: 't' }));
  hook('hook-session-start.mjs', {});
  hook('hook-user-prompt.mjs', { prompt: 'hello secret-should-not-appear' });
  hook('hook-stop.mjs', {});
  const events = readEvents(path.join(runDir, 'events.ndjson'));
  const types = events.map((e) => e.type);
  assert.ok(types.includes('session.start'));
  assert.ok(types.includes('user.prompt'));
  assert.ok(types.includes('turn.stop'));
  const up = events.find((e) => e.type === 'user.prompt');
  assert.equal(up.payload.length, 30);
  assert.equal(up.payload.contentOmitted, true);
});

test('subagent-stop：报告缺失 → risk.triggered；有报告 → 无风险；绝不 exit 2', () => {
  // 无报告
  let r = hook('hook-subagent-stop.mjs', {
    agent_id: 'a1',
    tool_response: { result: '完成 task_id=T-001，实现完成' },
  });
  assert.equal(r.status, 0);
  let events = readEvents(path.join(runDir, 'events.ndjson'));
  let stops = events.filter((e) => e.type === 'subagent.stop');
  assert.equal(stops.length, 1);
  assert.equal(stops[0].taskId, 'T-001');
  assert.equal(stops[0].payload.hasReport, false);
  assert.ok(events.some((e) => e.type === 'risk.triggered' && e.payload.id === 'missing-report-T-001'));

  // 有报告
  mkdirSync(path.join(runDir, 'reports'), { recursive: true });
  writeFileSync(path.join(runDir, 'reports', 'T-001-report.json'), '{}');
  r = hook('hook-subagent-stop.mjs', {
    agent_id: 'a2',
    tool_response: { result: '完成 task_id=T-001' },
  });
  assert.equal(r.status, 0);
  events = readEvents(path.join(runDir, 'events.ndjson'));
  const last = events.filter((e) => e.type === 'subagent.stop').pop();
  assert.equal(last.payload.hasReport, true);
});

test.after(() => rmSync(tmp, { recursive: true, force: true }));
