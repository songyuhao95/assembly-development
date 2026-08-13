// tests/dashboard.test.mjs — 仪表盘：CSP/405/404、revision ETag、快照热更新、路径穿越拒绝、只读性
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = mkdtempSync(path.join(os.tmpdir(), 'asm-dash-'));
const runtimeDir = path.join(tmp, 'runtime');
mkdirSync(runtimeDir, { recursive: true });

function fixture(revision, generatedAt) {
  mkdirSync(path.join(runtimeDir, 'snapshots'), { recursive: true });
  const snap = {
    schemaVersion: 1,
    revision,
    runId: 'run-test',
    phase: 'implement',
    generatedAt: generatedAt || new Date().toISOString(),
    staleAfterSeconds: 30,
    state: { runId: 'run-test', phase: 'implement', revision, taskStatuses: { 'T-001': { status: 'done' } }, gateStates: { G1: 'approved' }, updatedAt: null },
    tasks: [{ id: 'T-001', title: 't', contractId: 'c1', dependsOn: [], phase: 'implement', worktree: null, ownedPaths: [], acceptance: [] }],
    approvals: [],
    risks: [],
    worktrees: [],
    evidence: [],
  };
  writeFileSync(path.join(runtimeDir, 'snapshots', `${revision}.json`), JSON.stringify(snap));
  writeFileSync(path.join(runtimeDir, 'current-snapshot.json'), JSON.stringify({ revision, path: `snapshots/${revision}.json`, generatedAt: snap.generatedAt }));
  return snap;
}

let child;
let base;

test('启动：/ 与 /app.js 返回 200 + CSP/nosniff', async () => {
  fixture('rev-1');
  child = spawn(process.execPath, [path.resolve('dashboard/server.mjs'), runtimeDir], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((resolve) => child.stdout.once('data', resolve));
  const meta = JSON.parse(readFileSync(path.join(runtimeDir, 'dashboard.json'), 'utf8'));
  base = meta.url;
  const res = await fetch(`${base}index.html`);
  assert.equal(res.status, 200);
  const csp = res.headers.get('content-security-policy') || '';
  assert.ok(csp.includes("default-src 'none'"));
  assert.ok(csp.includes("script-src 'self'"));
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  const html = await res.text();
  assert.ok(html.includes('assembly-development'));
  const js = await (await fetch(`${base}app.js`)).text();
  assert.ok(js.includes('textContent'));
});

test('POST → 405；未知路径与路径穿越 → 404', async () => {
  const post = await fetch(`${base}snapshot.json`, { method: 'POST' });
  assert.equal(post.status, 405);
  assert.equal((await fetch(`${base}unknown/path`)).status, 404);
  assert.equal((await fetch(`${base}..%2f..%2fetc%2fpasswd`)).status, 404);
  assert.equal((await fetch(`${base}%5c%5cserver%5cserver`)).status, 404);
  assert.equal((await fetch(`${base}snapshot.json%00.html`)).status, 404);
});

test('snapshot.json：ETag + 304 协商', async () => {
  const res = await fetch(`${base}snapshot.json`);
  assert.equal(res.status, 200);
  const etag = res.headers.get('etag');
  assert.equal(etag, '"rev-1"');
  const body = await res.json();
  assert.equal(body.revision, 'rev-1');
  assert.ok(body.generatedAt && body.staleAfterSeconds > 0);
  const notMod = await fetch(`${base}snapshot.json`, { headers: { 'If-None-Match': etag } });
  assert.equal(notMod.status, 304);
});

test('snapshot.json：顶层键集合不变（envelope schema 锁定，无新增字段）', async () => {
  const EXPECTED_KEYS = ['schemaVersion', 'revision', 'runId', 'phase', 'generatedAt', 'staleAfterSeconds', 'state', 'tasks', 'approvals', 'risks', 'worktrees', 'evidence'];
  const body = await (await fetch(`${base}snapshot.json`)).json();
  assert.deepEqual(Object.keys(body).sort(), [...EXPECTED_KEYS].sort());
});

test('/revision：返回 revision/generatedAt/lastEventSeq，lastEventSeq 与 revision 一致', async () => {
  const res = await fetch(`${base}revision`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(Object.keys(body).sort(), ['generatedAt', 'lastEventSeq', 'revision']);
  assert.equal(body.lastEventSeq, body.revision);
  assert.equal(body.revision, 'rev-1');
});

test('快照热更新：publisher 原子替换后 server 返回新 revision（无锁、无重启）', async () => {
  fixture('rev-2');
  const res = await fetch(`${base}snapshot.json`);
  const body = await res.json();
  assert.equal(body.revision, 'rev-2');
});

test('/revision：lastEventSeq 随快照推进（事件流游标跟进 rev-2）', async () => {
  const body = await (await fetch(`${base}revision`)).json();
  assert.equal(body.lastEventSeq, 'rev-2');
  assert.equal(body.lastEventSeq, body.revision);
});

test('无快照时数据路由 → 503', async () => {
  rmSync(path.join(runtimeDir, 'current-snapshot.json'), { force: true });
  rmSync(path.join(runtimeDir, 'snapshots'), { recursive: true, force: true });
  assert.equal((await fetch(`${base}snapshot.json`)).status, 503);
  assert.equal((await fetch(`${base}revision`)).status, 503);
  assert.equal((await fetch(`${base}health`)).status, 200); // health 不受影响
});

test('恶意字段只作为数据返回（不渲染指令；渲染端只用 textContent）', async () => {
  const evil = fixture('rev-3');
  evil.tasks[0].title = '<script>alert(1)</script>';
  writeFileSync(path.join(runtimeDir, 'snapshots', 'rev-3.json'), JSON.stringify(evil));
  writeFileSync(path.join(runtimeDir, 'current-snapshot.json'), JSON.stringify({ revision: 'rev-3', path: 'snapshots/rev-3.json', generatedAt: evil.generatedAt }));
  const body = await (await fetch(`${base}snapshot.json`)).json();
  assert.ok(body.tasks[0].title.includes('<script>')); // 原样作为 JSON 数据返回，由客户端 textContent 安全渲染
});

test.after(() => {
  if (child && !child.killed) child.kill();
  rmSync(tmp, { recursive: true, force: true });
});
