// scripts/risks.mjs — 风险登记：add / list / set-status / trigger
//
// 用法：
//   node scripts/risks.mjs add --id R-1 --level high --condition "..." [--runId r]
//   node scripts/risks.mjs list [--runId r]
//   node scripts/risks.mjs set-status --id R-1 --status mitigated|open|accepted [--runId r]
//   node scripts/risks.mjs trigger --id R-1 [--verifyTaskId T-x] [--runId r]
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { appendEvent } from './lib/event-append.mjs';
import { projectRoot } from './lib/project-root.mjs';

const ROOT = projectRoot();
const EVENTS = path.join(ROOT, 'run', 'events.ndjson');
const RUNTIME = path.join(ROOT, 'run', '.runtime');
const PROJECTIONS = path.join(ROOT, 'run', 'projections');

const LEVELS = ['low', 'medium', 'high', 'critical'];

function fail(msg) {
  console.error(`risks.mjs: ${msg}`);
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

function arg(args, flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}

function emit(type, runId, payload) {
  appendEvent(EVENTS, {
    schemaVersion: 1,
    eventId: `evt-${Date.now()}-${Math.floor(Math.random() * 1e9)}`,
    at: new Date().toISOString(),
    type,
    runId,
    phase: null,
    taskId: null,
    contractId: null,
    agentId: null,
    actor: 'main',
    payload,
  });
}

function listRisks(runId) {
  const p = path.join(PROJECTIONS, runId, 'risks.json');
  if (!existsSync(p)) return [];
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return [];
  }
}

const [cmd, ...args] = process.argv.slice(2);
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const run = arg(args, '--runId') || activeRunId();
  if (cmd === 'add') {
    const id = arg(args, '--id');
    const level = arg(args, '--level');
    const condition = arg(args, '--condition');
    if (!id || !level || !condition) fail('add --id R-x --level low|medium|high|critical --condition "..." required');
    if (!LEVELS.includes(level)) fail(`level must be one of ${LEVELS.join(',')}`);
    if (!run) fail('no active run; pass --runId');
    emit('risk.added', run, { id, level, condition });
    console.log(`risk added: ${id} (${level})`);
  } else if (cmd === 'list') {
    if (!run) fail('no active run; pass --runId');
    const risks = listRisks(run);
    if (!risks.length) console.log('(no risks)');
    for (const r of risks) {
      console.log(`${r.id} [${r.level}] ${r.status}${r.triggeredAt ? ' triggered@' + r.triggeredAt : ''}${r.verifyTaskId ? ' verify=' + r.verifyTaskId : ''}`);
      if (r.condition) console.log(`    condition: ${r.condition}`);
    }
  } else if (cmd === 'set-status') {
    const id = arg(args, '--id');
    const status = arg(args, '--status');
    if (!id || !status) fail('set-status --id R-x --status mitigated|open|accepted required');
    if (!run) fail('no active run; pass --runId');
    emit('risk.status', run, { id, status });
    console.log(`risk ${id} -> ${status}`);
  } else if (cmd === 'trigger') {
    const id = arg(args, '--id');
    if (!id) fail('trigger --id R-x [--verifyTaskId T-x] required');
    if (!run) fail('no active run; pass --runId');
    emit('risk.triggered', run, { id, verifyTaskId: arg(args, '--verifyTaskId') });
    console.log(`risk triggered: ${id} (独立验证任务: ${arg(args, '--verifyTaskId') || '由主会话分配'})`);
  } else {
    console.error('usage: risks.mjs add|list|set-status|trigger ...');
    process.exit(2);
  }
}
