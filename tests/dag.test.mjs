// tests/dag.test.mjs — 计划冻结：环、缺失依赖、写范围重叠、ready 计算、冻结不可变
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validatePlan, freezePlan, computeReady } from '../scripts/tasks.mjs';

const tmp = mkdtempSync(path.join(os.tmpdir(), 'asm-dag-'));

const good = {
  runId: 'run-x',
  tasks: [
    { id: 'T-001', title: 'a', contractId: 'c1', dependsOn: [], phase: 'implement', ownedPaths: ['src/a/'], acceptance: [] },
    { id: 'T-002', title: 'b', contractId: 'c2', dependsOn: ['T-001'], phase: 'implement', ownedPaths: ['src/b/'], acceptance: [] },
  ],
};

test('合法计划通过校验并可冻结', () => {
  const v = validatePlan(good);
  assert.equal(v.ok, true, v.errors.join('; '));
  const out = path.join(tmp, 'run-x.json');
  const frozen = freezePlan(good, out, { baseCommit: 'sha256:abc', frozenAt: 't' });
  assert.equal(frozen.tasks.length, 2);
  assert.equal(frozen.baseCommit, 'sha256:abc');
});

test('冻结计划不可变：重复 freeze 拒绝，--force 可重写', () => {
  const out = path.join(tmp, 'immutable.json');
  freezePlan(good, out, {});
  assert.throws(() => freezePlan(good, out, {}), /already frozen/);
  freezePlan(good, out, { force: true });
  assert.ok(existsSync(out));
});

test('含环 DAG 被拒', () => {
  const cyclic = {
    runId: 'run-x',
    tasks: [
      { id: 'T-001', contractId: 'c1', dependsOn: ['T-002'], phase: 'implement', ownedPaths: ['a/'], acceptance: [] },
      { id: 'T-002', contractId: 'c2', dependsOn: ['T-001'], phase: 'implement', ownedPaths: ['b/'], acceptance: [] },
    ],
  };
  const v = validatePlan(cyclic);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.includes('cycle')));
});

test('缺失依赖被拒', () => {
  const bad = {
    runId: 'run-x',
    tasks: [{ id: 'T-001', contractId: 'c1', dependsOn: ['T-999'], phase: 'implement', ownedPaths: ['a/'], acceptance: [] }],
  };
  assert.equal(validatePlan(bad).ok, false);
});

test('并行任务写范围重叠被拒', () => {
  const bad = {
    runId: 'run-x',
    tasks: [
      { id: 'T-001', contractId: 'c1', dependsOn: [], phase: 'implement', ownedPaths: ['src/shared/'], acceptance: [] },
      { id: 'T-002', contractId: 'c2', dependsOn: [], phase: 'implement', ownedPaths: ['src/shared/'], acceptance: [] },
    ],
  };
  const v = validatePlan(bad);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.includes('overlap')));
});

test('ready：只返回依赖完成且自身未完成的节点', () => {
  const frozen = {
    runId: 'run-x',
    tasks: [
      { id: 'T-001', title: 'a', contractId: 'c1', dependsOn: [], phase: 'implement', worktree: null, ownedPaths: [], acceptance: [] },
      { id: 'T-002', title: 'b', contractId: 'c2', dependsOn: ['T-001'], phase: 'implement', worktree: null, ownedPaths: [], acceptance: [] },
      { id: 'T-003', title: 'c', contractId: 'c3', dependsOn: ['T-002'], phase: 'implement', worktree: null, ownedPaths: [], acceptance: [] },
    ],
  };
  assert.deepEqual(computeReady(frozen.tasks, {}), ['T-001']);
  assert.deepEqual(computeReady(frozen.tasks, { 'T-001': { status: 'done' } }), ['T-002']);
  assert.deepEqual(
    computeReady(frozen.tasks, { 'T-001': { status: 'done' }, 'T-002': { status: 'start' } }),
    []
  );
  assert.deepEqual(
    computeReady(frozen.tasks, { 'T-001': { status: 'done' }, 'T-002': { status: 'done' } }),
    ['T-003']
  );
});

test.after(() => rmSync(tmp, { recursive: true, force: true }));
