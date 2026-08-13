// scripts/identity.mjs — ID 生成与规范化哈希
//
// 用法：
//   node scripts/identity.mjs canonical <json|@file>   规范化 JSON（键递归排序）
//   node scripts/identity.mjs sha256 <json|@file>      sha256:<hex>
//   node scripts/identity.mjs next-run-id              下一个 RUN_ID
//   node scripts/identity.mjs next-task-id             下一个 TASK_ID
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EVENTS = path.join(ROOT, 'run', 'events.ndjson');
const TASKS_DIR = path.join(ROOT, 'run', 'tasks');

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonicalize(value[key]);
    return out;
  }
  return value;
}

export function sha256Hex(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

// 合同规范化哈希：删除 contract_sha256 后按规范形式计算
export function contractHash(frontmatter) {
  const { contract_sha256: _drop, ...rest } = frontmatter;
  return 'sha256:' + sha256Hex(JSON.stringify(canonicalize(rest)));
}

function readInput(arg) {
  if (arg.startsWith('@')) {
    return JSON.parse(readFileSync(path.resolve(ROOT, arg.slice(1)), 'utf8'));
  }
  return JSON.parse(arg);
}

function existingRunIds() {
  const ids = [];
  if (existsSync(EVENTS)) {
    try {
      for (const line of readFileSync(EVENTS, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try {
          const ev = JSON.parse(line);
          if (ev.runId) ids.push(ev.runId);
        } catch {
          /* skip torn line */
        }
      }
    } catch {
      /* ignore */
    }
  }
  if (existsSync(TASKS_DIR)) {
    for (const f of readdirSync(TASKS_DIR)) {
      if (f.endsWith('.json')) ids.push(f.slice(0, -5));
    }
  }
  return [...new Set(ids)];
}

export function nextRunId() {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `run-${today}-`;
  let max = 0;
  for (const id of existingRunIds()) {
    if (id.startsWith(prefix)) {
      const n = parseInt(id.slice(prefix.length), 10);
      if (!Number.isNaN(n) && n > max) max = n;
    }
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

export function nextTaskId() {
  const tasks = new Set();
  if (existsSync(TASKS_DIR)) {
    for (const f of readdirSync(TASKS_DIR)) {
      try {
        const plan = JSON.parse(readFileSync(path.join(TASKS_DIR, f), 'utf8'));
        for (const t of plan.tasks || []) tasks.add(t.id);
      } catch {
        /* ignore */
      }
    }
  }
  let n = 1;
  while (tasks.has(`T-${String(n).padStart(3, '0')}`)) n++;
  return `T-${String(n).padStart(3, '0')}`;
}

const [cmd, ...args] = process.argv.slice(2);
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
switch (cmd) {
  case 'canonical':
    console.log(JSON.stringify(canonicalize(readInput(args[0]))));
    break;
  case 'sha256':
    console.log('sha256:' + sha256Hex(JSON.stringify(canonicalize(readInput(args[0])))));
    break;
  case 'contract-hash': {
    const fm = readInput(args[0]);
    console.log(contractHash(fm));
    break;
  }
  case 'next-run-id':
    console.log(nextRunId());
    break;
  case 'next-task-id':
    console.log(nextTaskId());
    break;
  default:
    console.error('usage: identity.mjs canonical|sha256|contract-hash|next-run-id|next-task-id');
    process.exit(2);
}
}
