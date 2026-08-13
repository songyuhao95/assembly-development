# 技术方案 — 看板可观测性增强（dogfood）plan

- run_id: `run-20260813-001` ｜ task_id: `T-PLAN` ｜ phase: `plan`
- 合同: `contract-dogfood-plan-v1`（v1）｜ 输入: `dogfood-brief.md`（G1 已批准）、`docs/architecture.md`、`references/state-schema.md`
- 状态: **DRAFT** — 待 G2 `tasks.mjs freeze` 冻结后生效；本 DAG 仅 2 个垂直任务（T-001/T-002）

## 1. 范围与本 DAG 覆盖

产品简档（brief）含四项功能：连接状态徽章、刷新指示、相对时间显示、事件时间线。本 plan 合同将 DAG 固定为两个垂直任务，**仅覆盖其中两项**；其余两项不在本 DAG，显式记录为 deferred（非疏漏，见 §1.1）。

### 1.1 AC 覆盖映射

| AC | 内容 | 本 DAG 归属 | 状态 |
|---|---|---|---|
| AC-1 | 连接状态徽章三态 | — | **deferred**（不在本 DAG；后续 run 另立计划） |
| AC-2 | 刷新指示（200/304 更新，失败不更新） | T-001 | 覆盖 |
| AC-3 | 相对时间 60s/60min/24h 分档 + `<time datetime>` + tick ≤60s | T-001 | 覆盖 |
| AC-4 | 事件时间线（客户端派生，上限 50） | — | **deferred**（不在本 DAG；与 AC-1 同一后续计划） |
| AC-5 | 回归（gates/tasks/risks/worktrees/evidence 渲染、304/503/失联 banner、visibilitychange） | T-001、T-002 | 覆盖（各自既有行为不回归） |
| AC-6 | a11y（播报每态一次、tick 不播报、颜色非唯一、reduced-motion） | T-001（部分适用） | 覆盖（T-001 无新增交互控件，无焦点负担） |
| AC-7 | 硬不变量（grep 无 innerHTML/eval 等、CSP diff 为空、无新增静态文件） | T-001、T-002 | 覆盖（核查命令见 §4.2） |
| AC-8 | 测试证据逐条登记（_template-cases.md 模板） | T-001、T-002 | 覆盖 |
| AC-9 | 真实冒烟（P1，主会话 snapshot publish 后人工确认） | — | 集成后由主会话执行，非本 DAG 任务 |

### 1.2 贯穿硬约束（两任务共同遵守）

1. ADR-003：dashboard 为旁路只读消费者；仅 GET/HEAD；只读当前 revision 的 snapshot envelope；不写事件；失败不影响编排。
2. **不改 envelope schema**（schemaVersion 不变，envelope 零新字段）——T-002 的 lastEventSeq 从 pointer 派生，见 §3.2。
3. 不修改 `scripts/`、`run/`、`contracts/`；不新增任何文件到 `dashboard/` 之外且 `dashboard/` 下不新增静态文件（JS 全部留在 `/app.js`）。
4. textContent-only（无 innerHTML/insertAdjacentHTML/eval/new Function）；不改 CSP 头；无 CDN/外部网络资源。
5. 无新依赖：测试仅 `node:test` + `node:assert`（Node 内置）。
6. 共享文件（`.claude/settings.json`、`docs/architecture.md` 等）两任务均不得修改；`docs/architecture.md` 本次不更新（不在任何 ownedPaths 内，保持所有权隔离）。

## 2. T-001 相对时间显示 + 轮询刷新指示（前端）

- 合同引用：`contract-dogfood-t001-v1`｜ phase: implement ｜ 无依赖
- 验收锚点：AC-2（200 或 304 完成即更新「已刷新」，失败不更新）、AC-3（<60s「刚刚」、<60min「N 分钟前」、<24h「N 小时前」、≥24h「MM-DD HH:MM」；tick ≤60s 重算；`<time datetime>` 存在且合法）

### 2.1 实现要点

**(a) 纯函数层（app.js 顶部，导出）** — 与 DOM 解耦、可单测：

- `formatRelative(msElapsed)` → 分档文本：`<60_000` →「刚刚」；`<3_600_000` →「N 分钟前」（`Math.floor(ms/60_000)`）；`<86_400_000` →「N 小时前」（`Math.floor(ms/3_600_000)`）；`≥86_400_000` → 返回 `null`（由调用方走绝对时间）。负值/非有限值 clamp 为 0 →「刚刚」（display-only，接受时钟偏差，brief R2/Q7 默认）。
- `formatAbsolute(date)` → `MM-DD HH:MM`（本地时区，两位补零）。
- `renderTimeText(iso, nowMs)` → 解析 `Date.parse(iso)`；NaN（畸形 ISO）→ 返回原文兜底（brief R1 防御式读取）；合法 → 未满 24h 走相对、否则绝对。
- `computeStale(snapshot, nowMs)` → **保留现状语义**（`app.js` 现有 `computeStale` 原样抽取为纯函数）：`nowMs - Date.parse(generatedAt) > (staleAfterSeconds || 30) * 1000`；`generatedAt` 缺失/畸形 → 非 stale；快照为 null → 非 stale。现状行为即回归基线，用测试锁定。

**(b) app.js module 化（T-001 的使能改动）**：

- 现状 `app.js` 为 classic script（`<script src="/app.js">`），无法 `export`；且 Q6 禁止新增静态文件（新增文件需 server.mjs 加路由，超出 T-001 所有权）。因此：`index.html` 改 `<script type="module" src="/app.js">`，`app.js` 顶部定义纯函数并 `export`，文件末尾的浏览器引导代码（`visibilitychange` 监听、首轮 `poll()`、`setInterval(poll, POLL_MS)`）以 `if (typeof document !== 'undefined')` 守卫。
- 语义等价性：module 脚本延迟到 DOM 解析完成后执行；现状脚本位于 `</body>` 前，两者实际执行点相同（所有元素已存在），`poll()` 首轮时机不变。CSP `script-src 'self'` 覆盖 module 脚本，CSP 头不动。
- Node 侧（测试）`import '../dashboard/app.js'` 时 `document` 为 undefined → 引导跳过，仅获得纯函数。

**(c) 刷新指示（index.html + app.js）**：

- header meta 区新增 `#refresh-indicator`（含 `<time id="refresh-at" datetime="ISO">`），初始 `hidden`，首次轮询完成才显示；可见文本「已刷新 HH:MM:SS · 刚刚」，机器可读值在 `datetime`。
- 更新点：`poll()` 的 **200 与 304 两分支**均视为「轮询完成」——更新 `state.lastSuccessAt`、写 `datetime`、刷新可见文本。现状 304 分支直接 return（不更新 lastSuccessAt），T-001 需补上。503、非 2xx、网络异常分支不更新（保持上一次成功值），与 AC-2「失败不更新」一致。
- tick：新增 `setInterval(refreshRelativeTimes, 30_000)`（≤60s 约束，取 30s 留裕量）；`refreshRelativeTimes()` 遍历 `document.querySelectorAll('time[data-relative]')` 按 `datetime` 重算文本；每次轮询完成（200/304）后同步调用一次。`visibilitychange` 现有逻辑保留（回前台立即 poll → 指示随 poll 完成刷新）。

**(d) 既有时间戳接入相对时间**：

- 现状页面可见时间戳仅 meta 行「快照: `<generatedAt>`」；改为 `<time datetime="ISO" data-relative>` 渲染相对文本（raw ISO 保留在 `datetime`，可加 `title` 悬浮显示原值）。
- **不做**：新增 approvedAt/triggeredAt/updatedAt 列、时间线（AC-4 deferred）、徽章（AC-1 deferred）——超范围部分任何实现者不得顺手做，发现必要则上报而非扩scope。

### 2.2 文件所有权

| 文件 | 动作 |
|---|---|
| `dashboard/app.js` | 改：module 化 + 纯函数导出 + 相对时间渲染 + 刷新指示 + tick |
| `dashboard/index.html` | 改：`<script type="module">`、`#refresh-indicator` 元素、meta 快照时间戳改 `<time>` |
| `tests/dashboard-ui.test.mjs` | 新建：纯函数单测 + 1 条静态断言（见 §2.3） |

### 2.3 测试策略（node:test，无新依赖）

`tests/dashboard-ui.test.mjs`：`import` 纯函数自 `../dashboard/app.js`（module 化后可行），**全部注入 `nowMs`**，无时钟竞态、确定性：

| 用例 | 输入 → 预期 |
|---|---|
| 分档边界 | `formatRelative(0)`「刚刚」；`59_999`「刚刚」；`60_000`「1 分钟前」；`61_000`「1 分钟前」；`59*60_000`「59 分钟前」；`3_600_000`「1 小时前」；`23*3_600_000+59*60_000`「23 小时前」；`86_400_000` → null |
| 兜底 | `formatRelative(-1000)`「刚刚」（负值 clamp）；`renderTimeText('not-a-date', now)` 返回原文 |
| 绝对格式 | `formatAbsolute(new Date(2026, 0, 5, 9, 7))` → `"01-05 09:07"`；任意本地日期匹配 `/^\d{2}-\d{2} \d{2}:\d{2}$/`（避免时区脆断） |
| renderTimeText | 过去 30s →「刚刚」；过去 5min →「5 分钟前」；过去 30h → MM-DD HH:MM（正则） |
| stale 边界（锁定现状语义） | `generatedAt=now-31s, stale=30` → true；恰 30s → false（现状 `>` 语义）；29s → false；缺 `staleAfterSeconds` → 默认 30s；`generatedAt` 畸形 → false；null 快照 → false |
| 静态断言 | 读 `index.html`：含 `<script type="module" src="/app.js">`、含 `#refresh-indicator`（锁定 module 转换与指示元素不被移除） |

验证命令：`node --test tests/dashboard-ui.test.mjs`（exit 0）；全量 `node --test` 全绿。既有 `tests/dashboard.test.mjs` 由 T-002 所有，T-001 不得修改。

## 3. T-002 `/revision` 返回 lastEventSeq（服务端）

- 合同引用：`contract-dogfood-t002-v1`｜ phase: implement ｜ 无依赖
- 目标：`/revision` 响应新增 `lastEventSeq`；**不改 envelope schema、不改 pointer 格式**；现有路由/状态码/CSP 行为零回归。

### 3.1 推导链（lastEventSeq 从 pointer 派生的依据）

```
事件流 events.ndjson（append-only）
  └─ rebuildProjections: state.revision = 最后一个（去重后）事件的 eventId   [scripts/state.mjs]
       └─ buildEnvelope: envelope.revision = proj.state.revision              [scripts/snapshot.mjs]
            └─ publish: pointer.revision = envelope.revision（原子写指针）      [scripts/snapshot.mjs]
                 └─ server readSnapshot(): 读 pointer → 经 pointer.path 读 envelope
                      └─ lastEventSeq := snap.revision（即 pointer.revision）
```

- 事件 `eventId` 格式 `evt-<epochMs>-<random>`，按追加序单调（内嵌毫秒时间戳），即事件流的自然序号标识。
- **语义定义**：`lastEventSeq` = 快照所覆盖事件流中最后一个事件的 `eventId`（事件流游标）；`revision` = 快照标识。当前实现下两者同值（envelope.revision 本就由最后事件派生），但语义分离——revision 可独立于事件游标演进（如未来同一 revision 重复发布或快照标识不再等价于事件游标时，该字段即是客户端检测事件流进展的稳定契约）。本字段使客户端无需拉全量快照即可判断事件流是否推进。
- **零 schema 变更**：envelope 与 pointer 均不加字段；服务端仅读取 pointer 已携带的 `revision`。发布方（scripts/）零改动（本 plan 禁止改 scripts/）。

### 3.2 实现要点（dashboard/server.mjs `/revision` 分支）

```js
if (p === '/revision') {
  const snap = readSnapshot();
  if (!snap) { /* 503 分支不变 */ }
  send(res, 200, JSON.stringify({
    revision: snap.revision,
    generatedAt: snap.generatedAt,
    lastEventSeq: snap.revision, // 推导链：最后事件 eventId → envelope.revision → pointer.revision（§3.1）
  }), ...);
}
```

- 仅改 `/revision` 响应体；`readSnapshot()` 现有防御路径（pointer 缺失/畸形、快照文件缺失/畸形 → null → 503）原样复用，无新读路径、不触碰 events.ndjson。
- 不改 CSP、不改其他路由、不引入依赖；`/health`、`/snapshot.json`（ETag/304/503）、405/404 行为均不动。

### 3.3 文件所有权

| 文件 | 动作 |
|---|---|
| `dashboard/server.mjs` | 改：仅 `/revision` 分支响应体（加 `lastEventSeq`） |
| `tests/dashboard.test.mjs` | 改：`/revision` 正例断言（现状仅有 503 断言），并锁定 envelope 原样 |

### 3.4 测试策略（扩展 tests/dashboard.test.mjs，复用 runtimeDirOverride）

沿用现有 `fixture(revision, generatedAt)` + `runtimeDirOverride`（argv[2]）机制，新增用例：

| 用例 | 输入 → 预期 |
|---|---|
| /revision 正例 | fixture('rev-1') 后 GET `/revision` → 200，body 键恰为 `{revision, generatedAt, lastEventSeq}`，且 `lastEventSeq === revision === 'rev-1'` |
| 游标推进 | 重新 fixture('rev-2') 后 `/revision` → `lastEventSeq === 'rev-2'`（事件流游标随新快照推进） |
| 503 分支 | 删除 pointer 后 `/revision` → 503（现状断言保留，行为不回归） |
| envelope 原样（锁定不改 schema） | `/snapshot.json` body 键集合与 fixture 完全一致，无新增字段 |

验证命令：`node --test tests/dashboard.test.mjs`（exit 0）；全量 `node --test` 全绿。T-002 不得修改 `app.js`/`index.html`/`tests/dashboard-ui.test.mjs`。

## 4. 集成与共享约束

### 4.1 DAG 与并行性

- 两任务 `dependsOn: []`（可并行独立实现/测试/合并），ownedPaths 不重叠（T-001: `app.js`/`index.html`/`dashboard-ui.test.mjs`；T-002: `server.mjs`/`dashboard.test.mjs`），`validatePlan` 写范围重叠检查通过（无共享文件）。
- 集成：按 DAG 串行合并两任务 worktree；每任务独立全绿后再集成，集成后全量 `node --test` 必须全绿。

### 4.2 硬不变量核查（AC-7，验收命令）

- 全仓 grep 无 `innerHTML` / `insertAdjacentHTML` / `eval` / `new Function` / 外链 `http(s)://`。
- CSP diff：`git diff dashboard/server.mjs` 中 CSP 常量无任何变化（T-002 边界）。
- 无新增静态文件：`git status` 中 `dashboard/` 仅出现 `app.js`/`index.html`（T-001）/`server.mjs`（T-002）的修改。
- `tests/` 仅新增 `dashboard-ui.test.mjs`、修改 `dashboard.test.mjs`。

### 4.3 证据（AC-8）

两任务各自在 `docs/specs/_template-cases.md` 模板下逐条登记用例（输入/操作/预期/验证方法/证据路径/Pass-Fail），不适用项（如权限不足、并发）记录理由。

## 5. 风险登记（含缓解）

### 5.1 T-001

| ID | 风险 | 级别 | 条件 | 缓解 |
|---|---|---|---|---|
| R-T1 | classic→module 转换引入加载时序/兼容回归 | Low | 模块延迟执行、环境差异 | module 执行点与现状 `</body>` 前脚本等价（已论证 §2.1b）；静态断言锁定 `type="module"`；集成后浏览器冒烟（AC-9）；CSP 头不动 |
| R-T2 | 2s 轮询与 60s 分档交互产生边界显示抖动 | Low | 轮询完成瞬间恰跨档 | 纯函数注入 `nowMs` 单测消除测试竞态；渲染侧 poll 完成立即重算 + 30s tick，接受 ±1 档内偏差（display-only） |
| R-T3 | 客户端时钟偏差致相对时间失真 | Low | 本机时钟异常（brief R2/Q7 默认接受） | display-only 不写回；负值 clamp「刚刚」；如需精确 → 服务器时间差方案（后端变更，超出本 DAG，另立契约） |
| R-T4 | 现有渲染/横幅/重刷行为回归 | Medium | meta 行、banner、visibilitychange 被连带改动 | AC-5 对照：既有测试全绿 + 新增 stale 语义锁定用例（现状行为即基线）；改动面最小化 |
| R-T5 | 违反无新依赖/无新增静态文件/JS 单文件约束 | Low | 实现顺手引依赖或加文件 | 验收 grep（AC-7）+ ownedPaths 边界核查；新增文件需 server 路由 → 必然越界 → 阻断上报 |

### 5.2 T-002

| ID | 风险 | 级别 | 条件 | 缓解 |
|---|---|---|---|---|
| R-S1 | `lastEventSeq` 与 `revision` 同值被误判为冗余/语义混用，实现时被「简化」掉 | Medium | 实现者不理解设计意图 | §3.1 语义定义写入本方案与 T-002 合同；server.mjs 内联注释标明推导链；测试断言二者一致且随快照推进 |
| R-S2 | pointer/快照缺失或畸形 | Low | 未 publish / 写入中（原子 rename 窗口外） | 复用 `readSnapshot()` 现有防御路径；503 分支不变；负向用例保留 |
| R-S3 | 未来事件流/pointer 格式变更使推导链失效 | Low | schema 演进 | 推导链已文档化（§3.1），变更点唯一（publish 写 pointer）；任何变更须走 ADR/新契约（G2 冻结后 schema 不变） |
| R-S4 | 实现越界修改 envelope/pointer 格式 | Medium | 为「更完整」顺手加字段 | 测试断言 `/snapshot.json` 键集合原样（envelope 冻结）；只允许改 `server.mjs` 单文件；越界即停止上报 |

### 5.3 共享

| ID | 风险 | 级别 | 缓解 |
|---|---|---|---|
| R-C1 | 两任务并行 worktree 集成冲突 | Low | ownedPaths 不重叠（文件级互斥）；集成按 DAG 串行；两个测试文件互不依赖 |
| R-C2 | 真实冒烟依赖 `snapshot.mjs publish` 与人工观察 | Low | AC-9 为 P1，由主会话在集成后执行；自动测试全部基于构造 fixture，不依赖真实 run |
| R-C3 | 测试证据登记不全（AC-8） | Low | `_template-cases.md` 逐条登记，不适用项记录理由；verify 阶段按表核查 |

## 6. 矛盾检查声明

已核对：`contract-dogfood-plan-v1.md`（本合同）、`dogfood-brief.md`（G1 批准简档，含 Q1-Q10 默认假设）、`docs/architecture.md` + ADR-003（旁路只读）、`references/state-schema.md`（envelope/pointer/投影）、`dashboard/server.mjs`/`app.js`/`index.html`、`tests/dashboard.test.mjs`、`scripts/tasks.mjs`（freeze 校验）、`scripts/snapshot.mjs`/`state.mjs`（revision 推导链）、`scripts/tasks.mjs`。

**未发现矛盾**。要点：

- T-002 的 `lastEventSeq` 推导链（events → envelope.revision → pointer.revision → `/revision`）与「不改 envelope schema、从 pointer 派生」逐字一致；pointer 当前格式 `{revision, path, generatedAt}` 足以支撑，无需任何 schema 变更，也不触碰 forbidden 的 `scripts/`。
- T-001 的 module 化满足 Q6「JS 单文件、不新增静态文件」与 CSP `script-src 'self'`，无新依赖。
- 本 DAG 仅覆盖 brief 四项功能中的两项（AC-2/AC-3 + T-002 扩展）；AC-1 徽章与 AC-4 时间线不在本 DAG（§1.1 显式记录为 deferred，由后续 run 计划），与本 plan 合同正文 DAG 约束一致，非省略。
- 若实施阶段发现与本方案或 ADR 的新矛盾 → 停止上报，绝不猜测（runbook 停止规则）。
