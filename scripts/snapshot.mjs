// scripts/snapshot.mjs — 发布统一快照 envelope（UI 只读它）
//
// 用法：
//   node scripts/snapshot.mjs publish [runId]   生成 envelope + 原子更新 revision 指针
//   node scripts/snapshot.mjs show [runId]      打印当前指针指向的快照
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { appendEvent, readEvents } from './lib/event-append.mjs';
import { rebuildProjections } from './state.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EVENTS = path.join(ROOT, 'run', 'events.ndjson');
const SNAPSHOTS = path.join(ROOT, 'run', 'snapshots');
const RUNTIME = path.join(ROOT, 'run', '.runtime');
const POINTER = path.join(RUNTIME, 'current-snapshot.json');

const STALE_AFTER_SECONDS = 30;

function fail(msg) {
  console.error(`snapshot.mjs: ${msg}`);
  process.exit(2);
}

function activeRunId() {
  const active = path.join(RUNTIME, 'active-run.json');
  if (existsSync(active)) {
    try {
      return JSON.parse(readFileSync(active, 'utf8')).runId;
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

function loadTasks(runId) {
  const p = path.join(ROOT, 'run', 'tasks', `${runId}.json`);
  if (!existsSync(p)) return [];
  try {
    return JSON.parse(readFileSync(p, 'utf8')).tasks || [];
  } catch {
    return [];
  }
}

export function buildEnvelope(runId, events) {
  const proj = rebuildProjections(events);
  return {
    schemaVersion: 1,
    revision: proj.state.revision || 'init',
    runId: proj.state.runId || runId,
    phase: proj.state.phase || 'new',
    generatedAt: new Date().toISOString(),
    staleAfterSeconds: STALE_AFTER_SECONDS,
    state: proj.state,
    tasks: loadTasks(runId),
    approvals: proj.approvals,
    risks: proj.risks,
    worktrees: proj.worktrees,
    evidence: proj.evidence,
  };
}

function publish(runId) {
  const id = runId || activeRunId();
  if (!id) fail('no runId');
  const events = readEvents(EVENTS).filter((e) => e.runId === id);
  const envelope = buildEnvelope(id, events);
  const rev = envelope.revision;
  const snapPath = path.join(SNAPSHOTS, `${rev}.json`);
  atomicWrite(snapPath, JSON.stringify(envelope, null, 2) + '\n');
  atomicWrite(POINTER, JSON.stringify({ revision: rev, path: `snapshots/${rev}.json`, generatedAt: envelope.generatedAt }) + '\n');
  appendEvent(EVENTS, {
    schemaVersion: 1,
    eventId: `evt-${Date.now()}-${Math.floor(Math.random() * 1e9)}`,
    at: new Date().toISOString(),
    type: 'snapshot.released',
    runId: id,
    phase: envelope.phase,
    taskId: null,
    contractId: null,
    agentId: null,
    actor: 'script',
    payload: { revision: rev },
  });
  console.log(JSON.stringify({ revision: rev, path: snapPath }));
}

function show() {
  if (!existsSync(POINTER)) fail('no snapshot pointer; run publish first');
  const pointer = JSON.parse(readFileSync(POINTER, 'utf8'));
  const snapPath = path.join(ROOT, 'run', pointer.path);
  if (!existsSync(snapPath)) fail(`snapshot file missing: ${pointer.path}`);
  console.log(readFileSync(snapPath, 'utf8'));
}

const [cmd, ...args] = process.argv.slice(2);
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
switch (cmd) {
  case 'publish':
    publish(args[0]);
    break;
  case 'show':
    show();
    break;
  default:
    console.error('usage: snapshot.mjs publish [runId] | show');
    process.exit(2);
}
}
