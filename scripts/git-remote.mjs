// scripts/git-remote.mjs — 远程探测/推送容错封装
//
// 用法：
//   node scripts/git-remote.mjs check                    探测远程与 TLS 后端
//   node scripts/git-remote.mjs push [--branch <b>] [--tag <t>] [--allow-insecure]
//
// 推送链：默认 TLS → schannel → ssh 探测 → 仅当显式 --allow-insecure（用户已确认）
// 时一次性 sslVerify=false。全程不持久化任何不安全配置。
import { spawnSync } from 'node:child_process';
import { appendEvent } from './lib/event-append.mjs';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { projectRoot } from './lib/project-root.mjs';

const ROOT = projectRoot();

const REMOTE_NAME = 'origin';
const REMOTE_URL = 'https://github.com/songyuhao95/assembly-development.git';
const SSH_URL = 'git@github.com:songyuhao95/assembly-development.git';

function git(args, opts = {}) {
  const res = spawnSync('git', args, { encoding: 'utf8', cwd: ROOT, timeout: 60_000, ...opts });
  return { code: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
}

function runId() {
  const activePath = path.join(ROOT, 'run', '.runtime', 'active-run.json');
  if (existsSync(activePath)) {
    try {
      return JSON.parse(readFileSync(activePath, 'utf8')).runId;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function record(type, payload, code) {
  const id = runId();
  if (!id) return; // 无活动 run 时不写事件（与 hooks 规则一致）
  appendEvent(path.join(ROOT, 'run', 'events.ndjson'), {
    schemaVersion: 1,
    eventId: `evt-${Date.now()}-${Math.floor(Math.random() * 1e9)}`,
    at: new Date().toISOString(),
    type,
    runId: id,
    phase: 'release',
    taskId: null,
    contractId: null,
    agentId: null,
    actor: 'script',
    payload: { ...payload, code },
  });
}

function remoteUrl() {
  const res = git(['remote', 'get-url', REMOTE_NAME]);
  return res.code === 0 ? res.stdout.trim() : null;
}

function lsRemote(url, opts = {}) {
  return git(['ls-remote', '--heads', url], opts);
}

function sshProbe() {
  const res = spawnSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', '-T', 'git@github.com'], {
    encoding: 'utf8',
    timeout: 15_000,
  });
  // ssh -T 认证成功时 GitHub 返回 exit 1（并打印问候语）；255 = 失败
  return { ok: res.status === 1, status: res.status };
}

function check() {
  const url = remoteUrl();
  if (!url) {
    console.log(JSON.stringify({ ok: false, reason: 'no_remote', suggestion: `git remote add ${REMOTE_NAME} ${REMOTE_URL}` }));
    return 2;
  }
  let res = lsRemote(url);
  let backend = 'default';
  if (res.code !== 0) {
    res = lsRemote(url, { env: { ...process.env, GIT_SSL_BACKEND: 'schannel' } });
    backend = 'schannel';
    if (res.code !== 0) {
      const ssh = sshProbe();
      console.log(JSON.stringify({
        ok: false,
        reason: 'unreachable',
        url,
        tls_default: 'failed',
        tls_schannel: 'failed',
        ssh: ssh.ok ? 'ok' : 'failed',
        suggestion: ssh.ok ? `git remote set-url ${REMOTE_NAME} ${SSH_URL}` : 'network blocked; run local-only',
      }));
      return 1;
    }
  }
  console.log(JSON.stringify({ ok: true, url, backend }));
  return 0;
}

function push(args) {
  const url = remoteUrl();
  if (!url) {
    console.error(`no remote '${REMOTE_NAME}' configured`);
    return 2;
  }
  const branchIdx = args.indexOf('--branch');
  const branch = branchIdx >= 0 ? args[branchIdx + 1] : 'main';
  const tagIdx = args.indexOf('--tag');
  const tag = tagIdx >= 0 ? args[tagIdx + 1] : null;
  const allowInsecure = args.includes('--allow-insecure');

  const attempts = [
    { name: 'default', opts: {} },
    { name: 'schannel', opts: { env: { ...process.env, GIT_SSL_BACKEND: 'schannel' } } },
  ];
  for (const a of attempts) {
    record('remote.push_attempt', { backend: a.name, branch, tag }, null);
    let res = git(['push', '-u', REMOTE_NAME, branch], a.opts);
    if (res.code !== 0) continue;
    if (tag) {
      res = git(['push', REMOTE_NAME, tag], a.opts);
      if (res.code !== 0) {
        record('remote.push_attempt', { backend: a.name, tag, result: 'tag_failed', stderr: res.stderr.slice(0, 500) }, res.code);
        continue;
      }
    }
    record('remote.push_ok', { backend: a.name, branch, tag }, 0);
    console.log(JSON.stringify({ ok: true, backend: a.name, branch, tag }));
    return 0;
  }

  // ssh 探测
  const ssh = sshProbe();
  if (ssh.ok) {
    git(['remote', 'set-url', REMOTE_NAME, SSH_URL]);
    record('remote.push_fallback', { backend: 'ssh', branch, tag }, null);
    let res = git(['push', '-u', REMOTE_NAME, branch]);
    if (res.code === 0 && (!tag || git(['push', REMOTE_NAME, tag]).code === 0)) {
      record('remote.push_ok', { backend: 'ssh', branch, tag }, 0);
      console.log(JSON.stringify({ ok: true, backend: 'ssh', branch, tag }));
      return 0;
    }
  }

  // 最后手段：仅当用户已明确确认（--allow-insecure），一次性 sslVerify=false
  if (allowInsecure) {
    record('remote.push_fallback', { backend: 'insecure-once', branch, tag, userConfirmed: true }, null);
    const opts = { env: { ...process.env, GIT_SSL_NO_VERIFY: '1' } };
    let res = git(['push', '-u', REMOTE_NAME, branch], opts);
    if (res.code === 0 && (!tag || git(['push', REMOTE_NAME, tag], opts).code === 0)) {
      record('remote.push_ok', { backend: 'insecure-once', branch, tag }, 0);
      console.log(JSON.stringify({ ok: true, backend: 'insecure-once', branch, tag }));
      return 0;
    }
  }

  record('remote.push_fallback', { backend: 'failed', branch, tag, localOnly: true }, 1);
  console.log(JSON.stringify({ ok: false, localOnly: true, branch, tag, hint: '网络不可达：本地 tag + release snapshot 照常，状态标记未发布' }));
  return 1;
}

const [cmd, ...rest] = process.argv.slice(2);
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
if (cmd === 'check') process.exit(check());
else if (cmd === 'push') process.exit(push(rest));
else {
  console.error('usage: git-remote.mjs check | push [--branch b] [--tag t] [--allow-insecure]');
  process.exit(2);
}
}
