// dashboard/app.js — 看板客户端：轮询 /snapshot.json，textContent-only 渲染（ES module）
//
// T-001：module 化 + 相对时间显示 + 刷新指示。
// 纯函数层（formatRelative/formatAbsolute/renderTimeText/computeStale）与 DOM 解耦、
// 全部注入 nowMs 可单测；浏览器引导以 `typeof document !== 'undefined'` 守卫，
// Node 侧（node:test）import 仅获得纯函数。
// 索引页 <script type="module" src="/app.js"> 与本文件同步修改；CSP 不动。

const POLL_MS = 2000;
const REFRESH_TICK_MS = 30_000; // ≤60s 约束，取 30s 留裕量
const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

// —— 纯函数层（可单测，无 DOM/时钟依赖）——

// 相对时间分档：<60s「刚刚」、<60min「N 分钟前」、<24h「N 小时前」、≥24h → null
// （null 由调用方走绝对时间）。负值/非有限值 clamp 为 0 →「刚刚」（display-only，接受时钟偏差）。
export function formatRelative(nowMs, thenMs) {
  const elapsed = nowMs - thenMs;
  const safe = Number.isFinite(elapsed) && elapsed > 0 ? elapsed : 0;
  if (safe < MINUTE_MS) return '刚刚';
  if (safe < HOUR_MS) return `${Math.floor(safe / MINUTE_MS)} 分钟前`;
  if (safe < DAY_MS) return `${Math.floor(safe / HOUR_MS)} 小时前`;
  return null;
}

// 绝对时间「MM-DD HH:MM」（本地时区，两位补零）。
export function formatAbsolute(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// 渲染文本：畸形 ISO → 原文兜底（防御式读取）；未满 24h 走相对时间，否则绝对时间。
export function renderTimeText(iso, nowMs) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return String(iso);
  return formatRelative(nowMs, t) ?? formatAbsolute(new Date(t));
}

// stale 判定（保留现状语义，原样抽取为纯函数）：
// nowMs - Date.parse(generatedAt) > (staleAfterSeconds || 30) * 1000；
// generatedAt 缺失/畸形 → 非 stale。
export function computeStale(generatedAt, nowMs, staleAfterSeconds) {
  if (generatedAt == null) return false;
  const t = Date.parse(generatedAt);
  if (Number.isNaN(t)) return false;
  const limit = (staleAfterSeconds || 30) * 1000;
  return nowMs - t > limit;
}

// —— 浏览器侧渲染 ——

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

  // 元数据行：快照时间戳渲染为 <time datetime data-relative>（相对文本，raw ISO 在 datetime/title）
  const meta = $('meta');
  meta.textContent = '';
  const part = (text) => {
    const s = document.createElement('span');
    s.textContent = text;
    meta.appendChild(s);
  };
  part(`run: ${snap.runId}`);
  part(`phase: ${snap.phase}`);
  part(`revision: ${snap.revision}`);
  part(`事件数: ${Object.keys(snap.state?.taskStatuses || {}).length} 任务`);
  const label = document.createElement('span');
  label.textContent = '快照: ';
  const snapTime = document.createElement('time');
  snapTime.datetime = snap.generatedAt;
  snapTime.title = snap.generatedAt;
  snapTime.setAttribute('data-relative', '');
  snapTime.textContent = renderTimeText(snap.generatedAt, Date.now());
  label.appendChild(snapTime);
  meta.appendChild(label);

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

function isStale() {
  if (!state.lastSnapshot) return false;
  return computeStale(state.lastSnapshot.generatedAt, Date.now(), state.lastSnapshot.staleAfterSeconds);
}

// 刷新指示：datetime 存轮询完成时刻的 ISO，可见文本「已刷新 HH:MM:SS · 相对时间」。
function updateRefreshIndicator(nowMs) {
  const d = new Date(nowMs);
  const pad = (n) => String(n).padStart(2, '0');
  const iso = d.toISOString();
  $('refresh-at').datetime = iso;
  $('refresh-at').textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  $('refresh-ago').datetime = iso;
  $('refresh-ago').textContent = renderTimeText(iso, nowMs);
  $('refresh-indicator').hidden = false;
}

// 按 datetime 重算所有 data-relative 时间的文本（30s tick + 每次轮询完成后）。
function refreshRelativeTimes() {
  const now = Date.now();
  for (const el of document.querySelectorAll('time[data-relative]')) {
    const iso = el.getAttribute('datetime');
    if (!iso) continue;
    el.textContent = renderTimeText(iso, now);
  }
}

// 200 与 304 都视为「轮询完成」：更新刷新指示并重算相对时间。
// 503、非 2xx、网络异常分支不调用 → 失败不更新（AC-2）。
function onPollSuccess() {
  state.lastSuccessAt = Date.now();
  updateRefreshIndicator(state.lastSuccessAt);
  refreshRelativeTimes();
}

async function poll() {
  try {
    const res = await fetch('/snapshot.json', {
      headers: state.etag ? { 'If-None-Match': state.etag } : {},
      cache: 'no-store',
    });
    if (res.status === 304) {
      onPollSuccess(); // 304 也更新刷新指示（现状直接 return，T-001 补齐）
      if (isStale()) showBanner('快照已过期（stale）——生成器可能已停止。数据为最后一次有效快照。', false);
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
    render(snap);
    onPollSuccess();
    if (isStale()) showBanner('快照已过期（stale）——生成器可能已停止。数据为最后一次有效快照。', false);
    else hideBanner();
  } catch (err) {
    showBanner(`看板与快照服务失联：${err.message}。编排不受影响，保持最后一次有效数据。`, true);
  }
}

// 浏览器引导：Node（node:test import）下 document 为 undefined → 跳过，仅获得纯函数。
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    poll(); // 回到前台立即刷新
  });

  poll();
  setInterval(poll, POLL_MS);
  setInterval(refreshRelativeTimes, REFRESH_TICK_MS);
}
