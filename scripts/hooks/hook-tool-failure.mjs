// hooks/hook-tool-failure.mjs — 记录工具失败（仅活动 run）
//
// Claude Code：注册在 PostToolUseFailure（只会在失败时触发）。
// Codex：注册在 PostToolUse（每次触发）——仅当 tool_response 含 error 或
// Bash 输出含非零退出码标记时记录，避免正常调用被误记。
import { activeRun, EVENTS, event, readStdin } from './lib.mjs';
import { appendEvent } from '../lib/event-append.mjs';

const run = activeRun();
if (!run) process.exit(0);

const input = readStdin();
const command = (input.tool_input && input.tool_input.command) || '';
const resp = input.tool_response || {};

function looksLikeFailure(resp) {
  if (!resp) return false;
  if (resp.error !== undefined && resp.error !== null) return true;
  if (typeof resp === 'string') return false;
  const out = resp.output || resp.stdout || '';
  if (typeof out === 'string' && /(^|\n)exit[_ ]?code[=: ]+[1-9]\d*/i.test(out)) return true;
  return false;
}

if (input.hook_event_name === 'PostToolUse' && !looksLikeFailure(resp)) {
  process.exit(0); // Codex 正常调用，不记录
}

appendEvent(EVENTS, event('tool.failure', run, {
  command: command.slice(0, 200),
  error: JSON.stringify(resp).slice(0, 200),
}, { agentId: input.agent_id || null }));
process.exit(0);
