// dashboard/app.js — 看板客户端：轮询 /snapshot.json，textContent-only 渲染
'use strict';

const POLL_MS = 2000;
const $ = (id) => document.getElementById(id);

const state = {
  etag: null,
  lastSnapshot: null,
  lastSuccessAt: null,
  bannerHidden: true,
};

function pill(status) {
  const map = {
    done: 'ok', approved: 'ok', pass: 'ok', attached: 'ok', completed: 'ok',
    assigned: 'run', start: 'run', in_progress: 'run', open: 'warn', medium: 'warn',
    high: 'err', critical: 'err', failed: 'err', blocked: 'err', removed: 'muted',
    triggered: 'err', rework: 'err', fail: 'err',
  };
  const cls = map[status] || 'muted';
  const el = document.createElement('span');
  el.className = `pill ${cls}`;
  el.textContent = status || '—';
  return el;
}

function row(cells) {
  const tr = document.createElement('tr');
  for (const c of cells) {
    const td = document.createElement('td');
    if (c instanceof Node) td.appendChild(c);
    else td.textContent = String(c ?? '—');
    tr.appendChild(td);
  }
  return tr;
}

function render(snap) {
  state.lastSnapshot = snap;
  $('empty').hidden = true;

  $('meta').textContent = [
    `run: ${snap.runId}`,
    `phase: ${snap.phase}`,
    `revision: ${snap.revision}`,
    `事件数: ${Object.keys(snap.state?.taskStatuses || {}).length} 任务`,
    `快照: ${snap.generatedAt}`,
  ].join(' · ');

  // Gates
  const gates = ['G0', 'G1', 'G2', 'G3', 'G4', 'G5'];
  const gatesEl = $('gates');
  gatesEl.textContent = '';
  for (const g of gates) {
    const approved = (snap.state?.gateStates || {})[g] === 'approved';
    const span = document.createElement('span');
    span.className = `pill ${approved ? 'ok' : 'muted'}`;
    span.textContent = `${g} ${approved ? '已批准' : '未批准'}`;
    span.style.marginRight = '8px';
    gatesEl.appendChild(span);
  }
  $('sec-gates').hidden = false;

  // Tasks
  const statusOf = (id) => snap.state?.taskStatuses?.[id]?.status || 'planned';
  const tasks = snap.tasks || [];
  const tbody = $('tasks-body');
  tbody.textContent = '';
  for (const t of tasks) {
    tbody.appendChild(row([
      t.id, t.title,
      pill(statusOf(t.id)),
      t.phase,
      (t.dependsOn || []).join(', '),
      t.contractId,
    ]));
  }
  $('sec-tasks').hidden = tasks.length === 0;

  // Risks（最后状态优先）
  const lastById = new Map();
  for (const r of snap.risks || []) lastById.set(r.id, r);
  const risks = [...lastById.values()];
  const rbody = $('risks-body');
  rbody.textContent = '';
  for (const r of risks) {
    rbody.appendChild(row([r.id, pill(r.level), pill(r.status), r.condition, r.verifyTaskId]));
  }
  $('sec-risks').hidden = risks.length === 0;

  // Worktrees（最后状态优先）
  const wtById = new Map();
  for (const w of snap.worktrees || []) wtById.set(w.taskId, w);
  const wts = [...wtById.values()];
  const wbody = $('worktrees-body');
  wbody.textContent = '';
  for (const w of wts) {
    wbody.appendChild(row([w.taskId, w.path, w.branch, pill(w.status)]));
  }
  $('sec-worktrees').hidden = wts.length === 0;

  // Evidence
  const ebody = $('evidence-body');
  ebody.textContent = '';
  for (const e of snap.evidence || []) {
    ebody.appendChild(row([e.taskId, e.kind, e.path, pill(e.verdict), e.sha256]));
  }
  $('sec-evidence').hidden = (snap.evidence || []).length === 0;
}

function showBanner(text, isError) {
  const b = $('banner');
  b.textContent = text;
  b.className = isError ? 'err' : '';
  b.style.display = 'block';
  state.bannerHidden = false;
}

function hideBanner() {
  $('banner').style.display = 'none';
  state.bannerHidden = true;
}

function computeStale() {
  if (!state.lastSnapshot) return false;
  const generated = Date.parse(state.lastSnapshot.generatedAt);
  const limit = (state.lastSnapshot.staleAfterSeconds || 30) * 1000;
  return Date.now() - generated > limit;
}

async function poll() {
  try {
    const res = await fetch('/snapshot.json', {
      headers: state.etag ? { 'If-None-Match': state.etag } : {},
      cache: 'no-store',
    });
    if (res.status === 304) {
      if (computeStale()) showBanner('快照已过期（stale）——生成器可能已停止。数据为最后一次有效快照。', false);
      else hideBanner();
      return;
    }
    if (res.status === 503) {
      showBanner('尚无快照：运行 node scripts/snapshot.mjs publish <runId>。', false);
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const etag = res.headers.get('ETag');
    if (etag) state.etag = etag;
    const snap = await res.json();
    state.lastSuccessAt = Date.now();
    render(snap);
    if (computeStale()) showBanner('快照已过期（stale）——生成器可能已停止。数据为最后一次有效快照。', false);
    else hideBanner();
  } catch (err) {
    showBanner(`看板与快照服务失联：${err.message}。编排不受影响，保持最后一次有效数据。`, true);
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  poll(); // 回到前台立即刷新
});

poll();
setInterval(poll, POLL_MS);
