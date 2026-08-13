// hooks/lib.mjs — hook 脚本公共工具（无副作用导入）
//
// 项目解析：ASM_PROJECT_DIR 环境变量 > hook 输入的 cwd > 进程 cwd。
// 运行时脚本可装在用户级目录；hooks 始终针对"当前项目"的 run/ 目录。
// 测试覆盖：ASM_RUN_DIR 直接重定向 run 目录。
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export function hookProject(input) {
  if (process.env.ASM_PROJECT_DIR) return path.resolve(process.env.ASM_PROJECT_DIR);
  const cwd = input && input.cwd;
  if (cwd) return path.resolve(cwd);
  return process.cwd();
}

export function runDirFor(input) {
  if (process.env.ASM_RUN_DIR) return path.resolve(process.env.ASM_RUN_DIR);
  return path.join(hookProject(input), 'run');
}

export function eventsPath(input) {
  return path.join(runDirFor(input), 'events.ndjson');
}

export function reportsDir(input) {
  return path.join(runDirFor(input), 'reports');
}

// 只有存在活动 run 时才记录事件（避免普通会话污染项目工作树）
export function activeRun(input) {
  const p = path.join(runDirFor(input), '.runtime', 'active-run.json');
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
