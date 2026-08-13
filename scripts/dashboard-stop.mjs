// scripts/dashboard-stop.mjs — 停止仪表盘（PID 文件；taskkill 兜底）
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const META = path.join(ROOT, 'run', '.runtime', 'dashboard.json');

if (!existsSync(META)) {
  console.log('no dashboard meta; nothing to stop');
  process.exit(0);
}

let meta;
try {
  meta = JSON.parse(readFileSync(META, 'utf8'));
} catch {
  console.error('dashboard-stop.mjs: corrupt meta file; removing it');
  rmSync(META, { force: true });
  process.exit(1);
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

if (alive(meta.pid)) {
  try {
    process.kill(meta.pid, 'SIGTERM');
  } catch {
    /* fallthrough */
  }
  // Windows 兜底
  const deadline = Date.now() + 3000;
  const wait = setInterval(() => {
    if (!alive(meta.pid) || Date.now() > deadline) {
      clearInterval(wait);
      if (alive(meta.pid)) {
        spawnSync('taskkill', ['/PID', String(meta.pid), '/F'], { stdio: 'ignore' });
      }
      rmSync(META, { force: true });
      console.log(`dashboard stopped (pid ${meta.pid})`);
      process.exit(0);
    }
  }, 150);
} else {
  rmSync(META, { force: true });
  console.log(`dashboard was not running (stale pid ${meta.pid}); meta removed`);
  process.exit(0);
}
