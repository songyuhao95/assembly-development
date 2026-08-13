// scripts/tasks.mjs — 冻结计划（DAG）：freeze / show / ready
//
// 用法：
//   node scripts/tasks.mjs freeze <runId> <plan.json> [--force]
//   node scripts/tasks.mjs show <runId>
//   node scripts/tasks.mjs ready <runId>
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';
import { projectRoot } from './lib/project-root.mjs';

const ROOT = projectRoot();
const TASKS_DIR = path.join(ROOT, 'run', 'tasks');
const PROJECTIONS = path.join(ROOT, 'run', 'projections');

const ALLOWED_PHASES = ['clarify', 'plan', 'implement', 'integrate', 'verify', 'release'];

function fail(msg) {
  console.error(`tasks.mjs: ${msg}`);
  process.exit(2);
}

// 环检测（DFS 三色）+ 依赖存在性 + 唯一性 + 阶段合法性
export function validatePlan(plan) {
  const errors = [];
  const tasks = plan.tasks || [];
  const ids = new Set();
  const byId = {};
  for (const t of tasks) {
    if (!t.id) errors.push('task missing id');
    else if (ids.has(t.id)) errors.push(`duplicate task id: ${t.id}`);
    else ids.add(t.id);
    if (!t.contractId) errors.push(`task ${t.id} missing contractId`);
    if (!ALLOWED_PHASES.includes(t.phase)) errors.push(`task ${t.id}: invalid phase ${t.phase}`);
    if (t.dependsOn && !Array.isArray(t.dependsOn)) errors.push(`task ${t.id}: dependsOn must be an array`);
    byId[t.id] = t;
  }
  for (const t of tasks) {
    for (const d of t.dependsOn || []) {
      if (!ids.has(d)) errors.push(`task ${t.id} depends on missing task ${d}`);
    }
  }
  // 环检测
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = {};
  const visit = (id, chain) => {
    color[id] = GRAY;
    for (const d of byId[id].dependsOn || []) {
      if (color[d] === GRAY) errors.push(`cycle detected: ${[...chain, d].join(' -> ')}`);
      else if (color[d] === WHITE) visit(d, [...chain, d]);
    }
    color[id] = BLACK;
  };
  for (const t of tasks) color[t.id] = WHITE;
  for (const t of tasks) if (color[t.id] === WHITE) visit(t.id, [t.id]);
  // 并行任务写范围重叠检查（integration 除外）
  const owners = new Map();
  for (const t of tasks) {
    for (const p of t.ownedPaths || []) {
      if (owners.has(p)) errors.push(`write-range overlap: ${p} claimed by ${owners.get(p)} and ${t.id}`);
      owners.set(p, t.id);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function freezePlan(plan, outPath, { baseCommit = null, frozenAt = null, force = false } = {}) {
  if (existsSync(outPath) && !force) {
    throw new Error(`plan already frozen: ${outPath} (frozen plans are immutable; use --force only to rewrite after user-approved rework)`);
  }
  const verdict = validatePlan(plan);
  if (!verdict.ok) throw new Error(verdict.errors.join('\n'));
  const frozen = {
    schemaVersion: 1,
    runId: plan.runId,
    frozenAt: frozenAt || new Date().toISOString(),
    baseCommit,
    tasks: plan.tasks.map((t) => ({
      id: t.id,
      title: t.title || '',
      contractId: t.contractId,
      dependsOn: t.dependsOn || [],
      phase: t.phase,
      worktree: t.worktree || null,
      ownedPaths: t.ownedPaths || [],
      acceptance: t.acceptance || [],
    })),
  };
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(frozen, null, 2) + '\n', 'utf8');
  return frozen;
}

export function computeReady(frozenTasks, taskStatuses) {
  const statusOf = (id) => taskStatuses[id]?.status;
  return frozenTasks
    .filter((t) => {
      if (statusOf(t.id) === 'done' || statusOf(t.id) === 'assigned' || statusOf(t.id) === 'start') return false;
      return (t.dependsOn || []).every((d) => statusOf(d) === 'done');
    })
    .map((t) => t.id);
}

function loadFrozen(runId) {
  const p = path.join(TASKS_DIR, `${runId}.json`);
  if (!existsSync(p)) fail(`no frozen plan for ${runId}`);
  return JSON.parse(readFileSync(p, 'utf8'));
}

function loadState(runId) {
  const p = path.join(PROJECTIONS, runId, 'state.json');
  if (!existsSync(p)) return { taskStatuses: {} };
  return JSON.parse(readFileSync(p, 'utf8'));
}

const [cmd, ...args] = process.argv.slice(2);
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  switch (cmd) {
    case 'freeze': {
      const [runId, planPath] = args;
      if (!runId || !planPath) fail('usage: tasks.mjs freeze <runId> <plan.json> [--force]');
      try {
        const plan = JSON.parse(readFileSync(path.resolve(ROOT, planPath), 'utf8'));
        let baseCommit = null;
        try {
          baseCommit = execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
        } catch {
          baseCommit = null; // 无 Git 模式
        }
        const frozen = freezePlan(plan, path.join(TASKS_DIR, `${runId}.json`), {
          baseCommit,
          force: args.includes('--force'),
        });
        console.log(`frozen: ${runId} (${frozen.tasks.length} tasks, base ${baseCommit || 'no-git'})`);
      } catch (err) {
        fail(err.message);
      }
      break;
    }
    case 'show': {
      const runId = args[0];
      if (!runId) fail('usage: tasks.mjs show <runId>');
      console.log(JSON.stringify(loadFrozen(runId), null, 2));
      break;
    }
    case 'ready': {
      const runId = args[0];
      if (!runId) fail('usage: tasks.mjs ready <runId>');
      const frozen = loadFrozen(runId);
      const state = loadState(runId);
      const ready = computeReady(frozen.tasks, state.taskStatuses);
      console.log(ready.length ? ready.join('\n') : '(none ready)');
      break;
    }
    default:
      console.error('usage: tasks.mjs freeze <runId> <plan.json> [--force] | show <runId> | ready <runId>');
      process.exit(2);
  }
}
