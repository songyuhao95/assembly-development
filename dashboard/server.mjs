// dashboard/server.mjs — 旁路只读仪表盘（ADR-003）
//
// 仅 GET/HEAD；全内存路由，不做请求路径→文件系统解析（无路径遍历面）。
// 只读当前 revision 的 snapshot envelope；失败不影响编排。
// 运行：node dashboard/server.mjs [runtimeDirOverride]（测试用）
import { createServer } from 'node:http';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const RUNTIME = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, 'run', '.runtime');
// pointer.path 约定：相对 RUN 目录（run/），与 snapshot.mjs publish 一致
const RUN = path.dirname(RUNTIME);
const POINTER = path.join(RUNTIME, 'current-snapshot.json');
const DASHBOARD_META = path.join(RUNTIME, 'dashboard.json');

const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'unsafe-inline'",
  "connect-src 'self'",
  "img-src 'self' data:",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "worker-src 'none'",
].join('; ');

const indexHtml = readFileSync(path.join(HERE, 'index.html'), 'utf8');
const appJs = readFileSync(path.join(HERE, 'app.js'), 'utf8');

const NO_STORE = 'no-store';
const BASE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cache-Control': NO_STORE,
};

function readSnapshot() {
  if (!existsSync(POINTER)) return null;
  let pointer;
  try {
    pointer = JSON.parse(readFileSync(POINTER, 'utf8'));
  } catch {
    return null;
  }
  const snapPath = path.join(RUN, pointer.path);
  if (!existsSync(snapPath)) return null;
  try {
    return JSON.parse(readFileSync(snapPath, 'utf8'));
  } catch {
    return null;
  }
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...BASE_HEADERS, ...headers });
  res.end(body);
}

const server = createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, 405, 'method not allowed\n', { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Security-Policy': CSP });
    return;
  }
  const url = new URL(req.url, 'http://127.0.0.1');
  const p = url.pathname;
  const common = { 'Content-Security-Policy': CSP };
  if (p === '/' || p === '/index.html') {
    send(res, 200, indexHtml, { 'Content-Type': 'text/html; charset=utf-8', ...common });
    return;
  }
  if (p === '/app.js') {
    send(res, 200, appJs, { 'Content-Type': 'text/javascript; charset=utf-8', ...common });
    return;
  }
  if (p === '/health') {
    send(res, 200, JSON.stringify({ ok: true }), { 'Content-Type': 'application/json', ...common });
    return;
  }
  if (p === '/snapshot.json') {
    const snap = readSnapshot();
    if (!snap) {
      send(res, 503, JSON.stringify({ ok: false, reason: 'no snapshot published yet' }), { 'Content-Type': 'application/json', ...common });
      return;
    }
    const etag = `"${snap.revision}"`;
    if (req.headers['if-none-match'] === etag) {
      send(res, 304, '', { ETag: etag, ...common });
      return;
    }
    send(res, 200, JSON.stringify(snap), { 'Content-Type': 'application/json', ETag: etag, ...common });
    return;
  }
  if (p === '/revision') {
    const snap = readSnapshot();
    if (!snap) {
      send(res, 503, JSON.stringify({ ok: false, reason: 'no snapshot published yet' }), { 'Content-Type': 'application/json', ...common });
      return;
    }
    // lastEventSeq：事件流游标（快照所覆盖事件流中最后一个事件的 eventId）。
    // 推导链：事件流 eventId → envelope.revision（rebuildProjections）→ pointer.revision（publish 原子写指针）
    //   → server readSnapshot() 读 pointer，经 pointer.path 读 envelope；lastEventSeq := snap.revision（即 pointer.revision）。
    // 当前实现下与 revision 同值，但语义分离：revision 是快照标识，lastEventSeq 是客户端判断事件流推进的稳定契约。
    send(res, 200, JSON.stringify({ revision: snap.revision, generatedAt: snap.generatedAt, lastEventSeq: snap.revision }), { 'Content-Type': 'application/json', ...common });
    return;
  }
  send(res, 404, 'not found\n', { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Security-Policy': CSP });
});

server.listen(0, '127.0.0.1', () => {
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}/`;
  mkdirSync(RUNTIME, { recursive: true });
  writeFileSync(DASHBOARD_META, JSON.stringify({ pid: process.pid, url, startedAt: new Date().toISOString() }) + '\n', 'utf8');
  console.log(url); // 由 dashboard-start.mjs 捕获；detached 时日志被丢弃，meta 文件是权威
});
