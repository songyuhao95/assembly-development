// hooks/hook-stop-failure.mjs — StopFailure：记录失败（仅活动 run）
import { activeRun, EVENTS, event, readStdin } from './lib.mjs';
import { appendEvent } from '../lib/event-append.mjs';

const run = activeRun();
if (run) {
  const input = readStdin();
  const errText = typeof input.error === 'string' ? input.error : JSON.stringify(input.error || {});
  appendEvent(EVENTS, event('turn.failure', run, { error: errText.slice(0, 200) }));
}
process.exit(0);
