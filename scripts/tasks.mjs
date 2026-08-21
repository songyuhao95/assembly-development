// scripts/tasks.mjs — 冻结计划（DAG）：freeze / show / ready
//
// 用法：
//   node scripts/tasks.mjs freeze <runId> <plan.json> [--force]
//   node scripts/tasks.mjs show <runId>
//   node scripts/tasks.mjs ready <runId>
//   node scripts/tasks.mjs validate-v2 <plan.json> --result <result.json>
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

function canonicalOwnedPath(value, platform = process.platform) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const slashPath = value.trim().replaceAll('\\', '/');
  const normalized = path.posix.normalize(slashPath).replace(/^\.\//, '').replace(/\/+$/, '');
  if (path.posix.isAbsolute(normalized) || normalized === '..' || normalized.startsWith('../')) return null;
  return platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function pathsOverlap(left, right) {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

function dependencyReachable(byId, fromId, targetId, seen = new Set()) {
  if (fromId === targetId) return true;
  if (seen.has(fromId)) return false;
  seen.add(fromId);
  for (const dependency of byId[fromId]?.dependsOn || []) {
    if (dependency === targetId || dependencyReachable(byId, dependency, targetId, seen)) return true;
  }
  return false;
}

// 环检测（DFS 三色）+ 依赖存在性 + 唯一性 + 阶段合法性
export function validatePlan(plan) {
  const errors = [];
  const cycles = [];
  const overlaps = [];
  const missingDependencies = [];
  const invalidOwnedPaths = [];
  const missingContractErrors = [];
  const tasks = plan.tasks || [];
  const ids = new Set();
  const byId = {};
  for (const t of tasks) {
    if (!t.id) errors.push('task missing id');
    else if (ids.has(t.id)) errors.push(`duplicate task id: ${t.id}`);
    else ids.add(t.id);
    if (!t.contractId) {
      const message = `task ${t.id} missing contractId`;
      errors.push(message);
      missingContractErrors.push(message);
    }
    if (!ALLOWED_PHASES.includes(t.phase)) errors.push(`task ${t.id}: invalid phase ${t.phase}`);
    if (t.dependsOn && !Array.isArray(t.dependsOn)) errors.push(`task ${t.id}: dependsOn must be an array`);
    byId[t.id] = t;
  }
  for (const t of tasks) {
    for (const d of t.dependsOn || []) {
      if (!ids.has(d)) {
        const message = `task ${t.id} depends on missing task ${d}`;
        errors.push(message);
        missingDependencies.push({ taskId: t.id, dependency: d });
      }
    }
  }
  // 环检测
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = {};
  const visit = (id, chain) => {
    color[id] = GRAY;
    for (const d of byId[id].dependsOn || []) {
      if (color[d] === GRAY) {
        const cycle = [...chain, d];
        cycles.push(cycle);
        errors.push(`cycle detected: ${cycle.join(' -> ')}`);
      }
      else if (color[d] === WHITE) visit(d, [...chain, d]);
    }
    color[id] = BLACK;
  };
  for (const t of tasks) color[t.id] = WHITE;
  for (const t of tasks) if (color[t.id] === WHITE) visit(t.id, [t.id]);
  // 规范化 ownedPaths；只拒绝可能并行的任务之间的相同或父子前缀重叠。
  const canonicalByTask = new Map();
  for (const task of tasks) {
    const taskPaths = [];
    for (const ownedPath of task.ownedPaths || []) {
      const canonical = canonicalOwnedPath(ownedPath);
      if (!canonical) {
        const message = `task ${task.id}: invalid ownedPath ${ownedPath}`;
        errors.push(message);
        invalidOwnedPaths.push({ taskId: task.id, path: ownedPath });
      } else {
        taskPaths.push({ source: ownedPath, canonical });
      }
    }
    canonicalByTask.set(task.id, taskPaths);
  }
  for (let leftIndex = 0; leftIndex < tasks.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < tasks.length; rightIndex += 1) {
      const leftTask = tasks[leftIndex];
      const rightTask = tasks[rightIndex];
      const ordered = dependencyReachable(byId, leftTask.id, rightTask.id)
        || dependencyReachable(byId, rightTask.id, leftTask.id);
      if (ordered) continue;
      for (const leftPath of canonicalByTask.get(leftTask.id) || []) {
        for (const rightPath of canonicalByTask.get(rightTask.id) || []) {
          if (!pathsOverlap(leftPath.canonical, rightPath.canonical)) continue;
          const overlap = {
            leftTaskId: leftTask.id,
            leftPath: leftPath.source,
            rightTaskId: rightTask.id,
            rightPath: rightPath.source,
          };
          overlaps.push(overlap);
          errors.push(`write-range overlap: ${leftPath.source} claimed by ${leftTask.id} and ${rightPath.source} claimed by ${rightTask.id}`);
        }
      }
    }
  }
  return {
    ok: errors.length === 0,
    errors,
    cycles,
    overlaps,
    missingDependencies,
    missingContractErrors,
    invalidOwnedPaths,
  };
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
    // 保留已经批准的 seam/test owner/handover 等扩展字段，避免冻结时丢失合同语义。
    tasks: plan.tasks.map((t) => ({
      ...t,
      title: t.title || '',
      dependsOn: t.dependsOn || [],
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
    case 'validate-v2': {
      const planPath = args[0];
      const resultIndex = args.indexOf('--result');
      const resultPath = resultIndex >= 0 ? args[resultIndex + 1] : null;
      if (!planPath || !resultPath) fail('usage: tasks.mjs validate-v2 <plan.json> --result <result.json>');
      try {
        const plan = JSON.parse(readFileSync(path.resolve(ROOT, planPath), 'utf8'));
        const verdict = validatePlan(plan);
        const outputPath = path.resolve(ROOT, resultPath);
        mkdirSync(path.dirname(outputPath), { recursive: true });
        writeFileSync(outputPath, JSON.stringify({ schemaVersion: 1, ...verdict }, null, 2) + '\n', 'utf8');
        process.exit(verdict.ok ? 0 : 2);
      } catch (err) {
        fail(err.message);
      }
      break;
    }
    default:
      console.error('usage: tasks.mjs freeze <runId> <plan.json> [--force] | show <runId> | ready <runId> | validate-v2 <plan.json> --result <result.json>');
      process.exit(2);
  }
}
