// hooks/hook-pretool.mjs — PreToolUse(Bash)：危险命令硬阻断（唯一阻塞点）
// 红线无论是否有活动 run 都生效（安全边界，不依赖 run 状态）。
import { activeRun, EVENTS, event, readStdin } from './lib.mjs';
import { appendEvent } from '../lib/event-append.mjs';

const input = readStdin();
const command = (input.tool_input && input.tool_input.command) || '';

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

// 记录审计（仅活动 run）
const run = activeRun();
if (run) {
  appendEvent(EVENTS, event('tool.audit', run, { tool: 'Bash', command: command.slice(0, 200) }));
}
process.exit(0);
