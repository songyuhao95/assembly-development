// hooks/hook-stop.mjs — Stop：记录回合结束（仅活动 run；轻量）
import { activeRun, eventsPath, event, readStdin } from './lib.mjs';
import { appendEvent } from '../lib/event-append.mjs';

const input = readStdin();
const run = activeRun(input);
if (run) {
  appendEvent(eventsPath(input), event('turn.stop', run, {}));
}
process.exit(0);
