// hooks/hook-session-start.mjs — SessionStart：记录会话开始（仅活动 run）
import { activeRun, EVENTS, event, readStdin } from './lib.mjs';
import { appendEvent } from '../lib/event-append.mjs';
import { execSync } from 'node:child_process';

const run = activeRun();
if (run) {
  let gitVersion = null;
  try {
    gitVersion = execSync('git --version', { encoding: 'utf8', timeout: 3000 }).trim();
  } catch {
    gitVersion = null;
  }
  appendEvent(EVENTS, event('session.start', run, {
    nodeVersion: process.version,
    gitVersion,
  }));
}
process.exit(0);
