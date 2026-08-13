// hooks/hook-tool-failure.mjs — PostToolUseFailure(Bash)：记录失败（仅活动 run）
import { activeRun, EVENTS, event, readStdin } from './lib.mjs';
import { appendEvent } from '../lib/event-append.mjs';

const run = activeRun();
if (run) {
  const input = readStdin();
  const command = (input.tool_input && input.tool_input.command) || '';
  const errText = typeof input.error === 'string' ? input.error : JSON.stringify(input.error || {});
  appendEvent(EVENTS, event('tool.failure', run, {
    command: command.slice(0, 200),
    error: errText.slice(0, 200),
  }, { agentId: input.agent_id || null }));
}
process.exit(0);
