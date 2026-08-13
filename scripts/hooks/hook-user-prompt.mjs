// hooks/hook-user-prompt.mjs — UserPromptSubmit：记录提示元数据（不记录内容，防秘密入档）
import { activeRun, EVENTS, event, readStdin } from './lib.mjs';
import { appendEvent } from '../lib/event-append.mjs';

const run = activeRun();
if (run) {
  const prompt = (input) => (input && typeof input.prompt === 'string' ? input.prompt : '');
  const p = prompt(readStdin());
  appendEvent(EVENTS, event('user.prompt', run, { length: p.length, contentOmitted: true }));
}
process.exit(0);
