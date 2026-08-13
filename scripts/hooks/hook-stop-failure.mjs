// hooks/hook-stop-failure.mjs — StopFailure：记录失败（仅活动 run）
import { activeRun, eventsPath, event, readStdin } from './lib.mjs';
import { appendEvent } from '../lib/event-append.mjs';

const input = readStdin();
const run = activeRun(input);
if (run) {
  const errText = typeof input.error === 'string' ? input.error : JSON.stringify(input.error || {});
  appendEvent(eventsPath(input), event('turn.failure', run, { error: errText.slice(0, 200) }));
}
process.exit(0);
