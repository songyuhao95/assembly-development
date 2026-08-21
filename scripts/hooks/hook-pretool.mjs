// hooks/hook-pretool.mjs — PreToolUse(Bash)：危险命令硬阻断（唯一阻塞点）
// 红线无论是否有活动 run 都生效（安全边界，不依赖 run 状态）。
import { activeRun, eventsPath, event, readStdin } from './lib.mjs';
import { appendEvent } from '../lib/event-append.mjs';
import { evaluatePathRequest } from '../lib/v2-path-policy.mjs';

const input = readStdin();
const command = (input.tool_input && input.tool_input.command) || '';

// Advisory reminder for the soft single-writer boundary. This intentionally does
// not claim to be an ACL: structured path_policy_request remains the conditional
// deny path, while this text-only check asks the session to confirm its role.
const protectedDocument = /(?:M\d{2}[^\s/]*Module_Outline_Notes\.md|(?:^|[\\/])tasks[\\/][^\s]+\.md|\b\d{3}_[^\s/]+\.md|Outline_Notes\.md)/i;
const writeIntent = /(?:\b(?:write|edit|touch|move|copy|remove|del|set-content|add-content)\b|(?:^|\s)(?:node|python|powershell)\s+[^\s]*write[^\s]*|[>]{1,2})/i;
if (writeIntent.test(command) && protectedDocument.test(command)) {
  const actor = input.actor || input.session || {};
  const role = actor.role || actor.kind || 'unknown-role';
  const sessionId = actor.sessionId || actor.session_id || input.session_id || 'unknown-session';
  const target = command.match(protectedDocument)?.[0] || 'protected document';
  console.error(`assembly-development reminder: session=${sessionId} role=${role} target=${target}; 这是单写者提醒，请确认当前会话是否有权修改该模块合同/任务清单。提醒不替代 path-policy 权限判断。`);
}

const DENY_PATTERNS = [
  { re: /(^|\s)git\s+init(\s|$)/, why: '禁止静默 git init（无 Git 模式需显式用户批准）' },
  { re: /git\s+reset\s+--hard/, why: '禁止硬重置（不覆盖用户/基线变更）' },
  { re: /git\s+clean\s+(-[a-z]*f[adx]*\s+)+|git\s+clean\s+-fd/, why: '禁止清理未跟踪文件' },
  { re: /git\s+push\b[^\n|]*--force/, why: '禁止 force push' },
  { re: /rm\s+(-[a-zA-Z]+\s+)*-rf?\s+[^\n]*\.git/, why: '禁止删除 .git' },
  { re: /del\s+\/[sq]\s+[^\n]*\.git/i, why: '禁止删除 .git' },
];

for (const { re, why } of DENY_PATTERNS) {
  if (re.test(command)) {
    console.error(`assembly-development PreToolUse: 阻断危险命令 — ${why}\ncommand: ${command.slice(0, 300)}`);
    process.exit(2);
  }
}

// 支持平台适配器把同一份公开 path-policy request 嵌入 PreToolUse payload。
// 未提供结构化 request 的工具保持原行为；不从自由文本命令猜测文件写入范围。
const pathPolicyRequest = input.path_policy_request
  || input.tool_input?.path_policy_request
  || input.tool_input?.pathPolicyRequest;
if (pathPolicyRequest) {
  try {
    const verdict = evaluatePathRequest(pathPolicyRequest);
    if (!verdict.ok) {
      console.error(`assembly-development PreToolUse: path-policy 阻断 — ${JSON.stringify(verdict.decisions).slice(0, 500)}`);
      process.exit(2);
    }
  } catch (error) {
    console.error(`assembly-development PreToolUse: path-policy request 无效 — ${error.message}`);
    process.exit(2);
  }
}

// 记录审计（仅活动 run）
const run = activeRun(input);
if (run) {
  appendEvent(eventsPath(input), event('tool.audit', run, { tool: 'Bash', command: command.slice(0, 200) }));
}
process.exit(0);
