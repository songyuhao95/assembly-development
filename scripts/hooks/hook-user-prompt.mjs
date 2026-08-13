// hooks/hook-user-prompt.mjs — UserPromptSubmit：记录提示元数据（不记录内容，防秘密入档）
import { activeRun, eventsPath, event, readStdin } from './lib.mjs';
import { appendEvent } from '../lib/event-append.mjs';

const input = readStdin();
const run = activeRun(input);
if (run) {
  const p = input && typeof input.prompt === 'string' ? input.prompt : '';
  appendEvent(eventsPath(input), event('user.prompt', run, { length: p.length, contentOmitted: true }));
}
process.exit(0);
