// scripts/state.mjs — 事件追加与投影重建（真源核心）
//
// 用法：
//   node scripts/state.mjs run-start [runId]                      创建 run + active-run 指针
//   node scripts/state.mjs run-end [--phase DONE]                 结束 run（phase.enter 事件 + 移除指针）
//   node scripts/state.mjs phase <phase>                          追加 phase.enter
//   node scripts/state.mjs append --type x [--phase p] [--taskId t] [--contractId c]
//                          [--agentId a] [--actor main] [--payload '{}']
//   node scripts/state.mjs validate                                解析校验（torn tail 容忍）
//   node scripts/state.mjs rebuild [runId]                         重建全部投影
//   node scripts/state.mjs show [runId]                            打印 state 投影
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { appendEvent, readEvents } from './lib/event-append.mjs';
import { nextRunId } from './identity.mjs';
import { projectRoot } from './lib/project-root.mjs';

const ROOT = projectRoot();
const EVENTS = path.join(ROOT, 'run', 'events.ndjson');
const PROJECTIONS = path.join(ROOT, 'run', 'projections');
const RUNTIME = path.join(ROOT, 'run', '.runtime');
const ACTIVE = path.join(RUNTIME, 'active-run.json');

function fail(msg) {
  console.error(`state.mjs: ${msg}`);
  process.exit(2);
}

function activeRunId() {
  if (existsSync(ACTIVE)) {
    try {
      return JSON.parse(readFileSync(ACTIVE, 'utf8')).runId;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function atomicWrite(file, text) {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  writeFileSync(tmp, text, 'utf8');
  renameSync(tmp, file);
}

function buildEvent(opts) {
  const runId = opts.runId || activeRunId();
  if (!runId) fail('no active run; run "state.mjs run-start" first or pass runId');
  return {
    schemaVersion: 1,
    eventId: `evt-${Date.now()}-${Math.floor(Math.random() * 1e9)}`,
    at: new Date().toISOString(),
    type: opts.type,
    runId,
    phase: opts.phase || null,
    taskId: opts.taskId || null,
    contractId: opts.contractId || null,
    agentId: opts.agentId || null,
    actor: opts.actor || 'main',
    payload: opts.payload || {},
  };
}

// ---------- 投影重建 ----------

export class RecoveryRequiredError extends Error {}

// 状态类事件按 entity 去冲突：同 key 不同 payload 内容 → 恢复错误
const CONFLICT_KEYS = {
  'task.done': (ev) => `task.done:${ev.taskId}`,
  'task.start': (ev) => `task.start:${ev.taskId}`,
  'task.assign': (ev) => `task.assign:${ev.taskId}`,
  'phase.enter': (ev) => `phase.enter:${ev.phase}`,
};

export function rebuildProjections(events) {
  const state = {
    runId: null,
    phase: null,
    revision: null,
    taskStatuses: {},
    gateStates: {},
    updatedAt: null,
  };
  const approvals = [];
  const risks = [];
  const worktrees = [];
  const evidence = [];
  const seen = new Set();
  const conflictContent = new Map();

  for (const ev of events) {
    if (seen.has(ev.eventId)) continue; // 幂等：重复 eventId 跳过
    seen.add(ev.eventId);
    const key = CONFLICT_KEYS[ev.type] ? CONFLICT_KEYS[ev.type](ev) : null;
    if (key) {
      const content = JSON.stringify(ev.payload);
      if (conflictContent.has(key) && conflictContent.get(key) !== content) {
        throw new RecoveryRequiredError(`conflicting duplicate event: ${key}`);
      }
      conflictContent.set(key, content);
    }
    state.runId = ev.runId || state.runId;
    state.revision = ev.eventId;
    state.updatedAt = ev.at;
    switch (ev.type) {
      case 'phase.enter':
        state.phase = ev.payload.phase || ev.phase;
        break;
      case 'task.assign':
      case 'task.start':
      case 'task.done':
        state.taskStatuses[ev.taskId] = {
          status: ev.type.replace('task.', ''),
          phase: ev.phase,
          contractId: ev.contractId,
          agentId: ev.agentId,
          updatedAt: ev.at,
          payload: ev.payload,
        };
        break;
      case 'gate.approved':
        state.gateStates[ev.payload.gate] = 'approved';
        approvals.push({
          gate: ev.payload.gate,
          artifact: ev.payload.artifact || null,
          sha256: ev.payload.sha256 || null,
          approvedAt: ev.at,
          by: ev.payload.by || 'human',
          eventId: ev.eventId,
        });
        break;
      case 'risk.added':
      case 'risk.triggered':
      case 'risk.status':
        risks.push({
          id: ev.payload.id,
          level: ev.payload.level || null,
          condition: ev.payload.condition || null,
          status: ev.type === 'risk.added' ? 'open' : ev.payload.status || ev.type,
          triggeredAt: ev.type === 'risk.triggered' ? ev.at : ev.payload.triggeredAt || null,
          verifyTaskId: ev.payload.verifyTaskId || null,
          eventId: ev.eventId,
        });
        break;
      case 'worktree.attach':
        worktrees.push({
          taskId: ev.taskId,
          path: ev.payload.path,
          branch: ev.payload.branch || null,
          base: ev.payload.base || null,
          status: 'attached',
          updatedAt: ev.at,
        });
        break;
      case 'worktree.remove':
        worktrees.push({
          taskId: ev.taskId,
          path: ev.payload.path,
          branch: null,
          base: null,
          status: 'removed',
          updatedAt: ev.at,
        });
        break;
      case 'evidence.recorded':
        evidence.push({
          taskId: ev.taskId,
          contractId: ev.contractId,
          kind: ev.payload.kind || null,
          path: ev.payload.path || null,
          sha256: ev.payload.sha256 || null,
          verdict: ev.payload.verdict || null,
          eventId: ev.eventId,
        });
        break;
      default:
        break; // session.* / turn.* / remote.* / snapshot.* 不进业务投影
    }
  }
  return { state, approvals, risks, worktrees, evidence };
}

function runIdFor(opts) {
  return opts.runId || activeRunId();
}

function saveProjections(runId, proj) {
  const dir = path.join(PROJECTIONS, runId);
  mkdirSync(dir, { recursive: true });
  for (const [name, data] of Object.entries(proj)) {
    atomicWrite(path.join(dir, `${name}.json`), JSON.stringify(data, null, 2) + '\n');
  }
}

// ---------- 命令 ----------

function cmdRunStart(runId) {
  const id = runId || nextRunId();
  if (activeRunId() && activeRunId() !== id) {
    fail(`another run is active: ${activeRunId()}; run "run-end" first`);
  }
  atomicWrite(ACTIVE, JSON.stringify({ runId: id, startedAt: new Date().toISOString() }) + '\n');
  appendEvent(EVENTS, buildEvent({ runId: id, type: 'run.start', phase: 'new', actor: 'script' }));
  console.log(id);
}

function cmdRunEnd() {
  const id = activeRunId();
  if (!id) fail('no active run');
  const idx = process.argv.indexOf('--phase');
  const phase = idx >= 0 ? process.argv[idx + 1] : 'done';
  appendEvent(EVENTS, buildEvent({ runId: id, type: 'phase.enter', phase, actor: 'main', payload: { phase } }));
  try {
    renameSync(ACTIVE, ACTIVE + `.ended-${id}`);
  } catch {
    /* 指针残留可被 run-start 覆盖检查 */
  }
  console.log(id);
}

function cmdPhase(phase) {
  appendEvent(EVENTS, buildEvent({ type: 'phase.enter', phase, actor: 'main', payload: { phase } }));
}

function cmdAppend(argv) {
  const opts = { type: null, phase: null, taskId: null, contractId: null, agentId: null, actor: 'main', payload: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--type') opts.type = argv[++i];
    else if (a === '--phase') opts.phase = argv[++i];
    else if (a === '--taskId') opts.taskId = argv[++i];
    else if (a === '--contractId') opts.contractId = argv[++i];
    else if (a === '--agentId') opts.agentId = argv[++i];
    else if (a === '--actor') opts.actor = argv[++i];
    else if (a === '--payload') opts.payload = JSON.parse(argv[++i]);
    else if (a === '--runId') opts.runId = argv[++i];
    else fail(`unknown arg: ${a}`);
  }
  if (!opts.type) fail('--type required');
  const ev = buildEvent(opts);
  appendEvent(EVENTS, ev);
  console.log(ev.eventId);
}

function cmdValidate() {
  const events = readEvents(EVENTS); // 解析失败即抛错 → fail-closed
  for (const ev of events) {
    if (!ev || ev.schemaVersion !== 1 || !ev.eventId || !ev.type || !ev.at) {
      fail(`invalid event: ${JSON.stringify(ev).slice(0, 200)}`);
    }
  }
  console.log(`ok: ${events.length} events`);
}

function cmdRebuild(runId) {
  const id = runId || runIdFor({});
  if (!id) fail('no runId');
  const events = readEvents(EVENTS).filter((e) => e.runId === id);
  const proj = rebuildProjections(events);
  saveProjections(id, proj);
  console.log(`rebuilt projections for ${id} (${events.length} events, revision ${proj.state.revision})`);
}

function cmdShow(runId) {
  const id = runId || runIdFor({});
  if (!id) fail('no runId');
  const p = path.join(PROJECTIONS, id, 'state.json');
  if (!existsSync(p)) fail(`no projections for ${id}; run rebuild first`);
  console.log(readFileSync(p, 'utf8'));
}

const [cmd, ...args] = process.argv.slice(2);
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
switch (cmd) {
  case 'run-start':
    cmdRunStart(args[0]);
    break;
  case 'run-end':
    cmdRunEnd();
    break;
  case 'phase':
    cmdPhase(args[0]);
    break;
  case 'append':
    cmdAppend(args);
    break;
  case 'validate':
    cmdValidate();
    break;
  case 'rebuild':
    cmdRebuild(args[0]);
    break;
  case 'show':
    cmdShow(args[0]);
    break;
  default:
    console.error('usage: state.mjs run-start|run-end|phase|append|validate|rebuild|show');
    process.exit(2);
}
}
