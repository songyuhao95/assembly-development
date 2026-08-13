// hooks/hook-stop.mjs — Stop：记录回合结束（仅活动 run；轻量）
import { activeRun, EVENTS, event } from './lib.mjs';
import { appendEvent } from '../lib/event-append.mjs';

const run = activeRun();
if (run) {
  appendEvent(EVENTS, event('turn.stop', run, {}));
}
process.exit(0);
