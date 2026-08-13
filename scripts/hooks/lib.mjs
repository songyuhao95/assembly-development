// hooks/lib.mjs — hook 脚本公共工具（无副作用导入）
//
// 路径可被环境变量覆盖（测试用）：
//   ASM_RUN_DIR=<dir>  重定向 run 目录（runtime/events/reports）
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const RUN_DIR = process.env.ASM_RUN_DIR ? path.resolve(process.env.ASM_RUN_DIR) : path.join(ROOT, 'run');
export const RUNTIME = path.join(RUN_DIR, '.runtime');
export const EVENTS = path.join(RUN_DIR, 'events.ndjson');
export const REPORTS = path.join(RUN_DIR, 'reports');

// 只有存在活动 run 时才记录事件（避免普通会话污染仓库工作树）
export function activeRun() {
  const p = path.join(RUNTIME, 'active-run.json');
  if (!existsSync(p)) return null;
  try {
    const meta = JSON.parse(readFileSync(p, 'utf8'));
    return meta.runId || null;
  } catch {
    return null;
  }
}

// 读取 stdin 的 hook payload（同步、限长 1MB）
export function readStdin() {
  try {
    const buf = readFileSync(0, 'utf8');
    if (!buf || buf.length > 1_000_000) return {};
    return JSON.parse(buf);
  } catch {
    return {};
  }
}

export function event(type, runId, payload = {}, extra = {}) {
  return {
    schemaVersion: 1,
    eventId: `evt-${Date.now()}-${Math.floor(Math.random() * 1e9)}`,
    at: new Date().toISOString(),
    type,
    runId,
    phase: null,
    taskId: extra.taskId || null,
    contractId: extra.contractId || null,
    agentId: extra.agentId || null,
    actor: 'hook',
    payload,
  };
}
