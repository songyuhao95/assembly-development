// scripts/dashboard-start.mjs — 启动仪表盘（detached），等待就绪后打印 URL
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectRoot } from './lib/project-root.mjs';

const ROOT = projectRoot();
const RUNTIME = path.join(ROOT, 'run', '.runtime');
const META = path.join(RUNTIME, 'dashboard.json');
const SERVER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dashboard', 'server.mjs');

function fail(msg) {
  console.error(`dashboard-start.mjs: ${msg}`);
  process.exit(2);
}

// 已运行？PID 存活且 meta 有效则复用
if (existsSync(META)) {
  try {
    const meta = JSON.parse(readFileSync(META, 'utf8'));
    const alive = isAlive(meta.pid);
    if (alive) {
      console.log(meta.url);
      process.exit(0);
    }
  } catch {
    /* 继续启动新实例 */
  }
}

mkdirSync(RUNTIME, { recursive: true });
// server 第一个参数 = 项目 run 目录（快照指针所在）
const child = spawn(process.execPath, [SERVER, path.join(ROOT, 'run')], {
  detached: true,
  stdio: 'ignore',
  windowsHide: true,
});
child.unref();

// 轮询 meta 文件与 /health，最多 5 秒
const deadline = Date.now() + 5000;
const timer = setInterval(async () => {
  if (existsSync(META)) {
    try {
      const meta = JSON.parse(readFileSync(META, 'utf8'));
      const res = await fetch(`${meta.url}health`);
      if (res.ok) {
        clearInterval(timer);
        console.log(meta.url);
        process.exit(0);
      }
    } catch {
      /* 继续等 */
    }
  }
  if (Date.now() > deadline) {
    clearInterval(timer);
    fail('dashboard did not become ready in 5s; check run/.runtime/dashboard.json and dashboard/server.mjs');
  }
}, 250);

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
