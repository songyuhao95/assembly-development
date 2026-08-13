# 澄清问题清单 — 看板可观测性增强（dogfood）

- run_id: `run-20260813-001` ｜ task_id: `T-000` ｜ phase: `clarify`
- 合同: `contract-dogfood-clarify-v1`（v2，`sha256:c2eaa336…`）
- 状态: 待用户回答 P0 后，按答案修订 `dogfood-brief.md` 并进入 G1

## 现状事实（回答问题的上下文，均来自磁盘）

- 快照 envelope（`references/state-schema.md`）：`schemaVersion/revision/runId/phase/generatedAt/staleAfterSeconds(默认30)/state{taskStatuses,gateStates}/tasks[]/approvals[]/risks[]/worktrees[]/evidence[]`。**不含原始事件流**。
- 服务器路由仅 5 条：`/`、`/index.html`、`/app.js`、`/health`、`/snapshot.json`、`/revision`（`dashboard/server.mjs`）。新增静态资源必须改服务端路由。
- CSP（服务端已设，`dashboard/server.mjs`）：`default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; worker-src 'none'`。无 CDN/外部脚本/外部字体的可行空间。
- 现状渲染（`dashboard/app.js`）：textContent-only（无 innerHTML），2s 轮询 + ETag 304 + `visibilitychange` 重刷；banner 承载 stale/失联文案；`state.lastSuccessAt` 已记录但未使用。
- 测试现状：`scripts/self-test.mjs` 只查脚本存在性；仓库内无 dashboard 行为测试；`server.mjs` 支持 `runtimeDirOverride`（argv[2]，测试钩子已预留）。
- 证据投影 `evidence[]` 无时间戳（仅 `eventId`）；`approvals[]` 有 `approvedAt`、`risks[]` 有 `triggeredAt`、`worktrees[]` 有 `updatedAt`。

## 问题总览

| ID | 优先级 | 主题 | 需用户确认 |
|---|---|---|---|
| Q1 | P0 | 范围取舍：四项功能组合 | 是 |
| Q2 | P0 | 事件时间线数据来源（是否动后端/schema） | 是 |
| Q3 | P0 | 验收标准量化锚点（阈值与行为判据） | 是 |
| Q4 | P1 | 相对时间显示粒度与格式 | 否（可按默认） |
| Q5 | P0 | a11y 标准范围 | 是 |
| Q6 | P0 | textContent-only / 无 CDN / CSP 约束确认 | 是 |
| Q7 | P1 | 客户端时钟偏差接受度 | 否（可按默认） |
| Q8 | P0 | 测试层级与工具（是否引入浏览器 E2E 依赖） | 是 |
| Q9 | P1 | verify 阶段风险分级（R0/R1） | 否（可按默认） |
| Q10 | P1 | 演练数据真实度（构造数据 vs 真实 run 冒烟） | 否（可按默认） |

## A. 范围取舍

### Q1（P0）四项候选功能的组合

原需求候选四项：相对时间显示、刷新指示、事件时间线、连接状态徽章。

- **默认假设**：四项全做（一次垂直改造保持完整性，各自可独立实现与测试）。
- **影响**：全做 = 范围最大、实施成本最高（估计占本次工作量 100%）；若砍项可缩小：仅徽章+刷新指示 ≈ 40%，加相对时间 ≈ 70%，时间线为最重一项（派生+排序+分页逻辑）。
- **风险**：砍项后"可观测性增强"目标不完整，狗粮演练覆盖度下降；全做则验收面更大。

### Q2（P0）事件时间线的数据来源

- **默认假设**：仅从现有 envelope 字段**客户端派生**时间线（approvals.`approvedAt` / risks.`triggeredAt` / worktrees.`updatedAt` 合并排序），**零后端变更**，保持 ADR-003 旁路只读与 envelope schema 不动。
- **影响（范围/成本/风险）**：客户端派生 → 只改 `dashboard/`，成本最低；代价是覆盖有限（`evidence[]` 无时间戳、任务状态变更无事件时间，时间线不完整）。备选：在 `snapshot.mjs` 发布时向 envelope 增加事件子集字段 → 范围扩到 `scripts/` + `state-schema.md` + `docs/architecture.md`（文档同步），且 `schemaVersion` 需递增并处理旧快照兼容，成本与风险显著上升。
- **风险**：若用户未表态而实施选了后端方案，会违反本合同 forbidden_paths（scripts/）精神并扩大狗粮范围。

## B. 验收标准

### Q3（P0）验收标准量化锚点

每条 AC 必须可量化、可机械验证（quality.md 防 Goodhart：禁止主观"美观"标准）。

- **默认假设**：
  - 相对时间分档：<60s「刚刚」；<60min「N 分钟前」；<24h「N 小时前」；≥24h 绝对时间；刻度重算 ≤60s。
  - 刷新指示：每次轮询完成（200 或 304）即更新「已刷新」时间；失败不更新。
  - 失联判定：fetch 异常或非 2xx/304 视为失联；快照过期沿用 `staleAfterSeconds`（30s）。
  - 时间线：倒序、上限 50 条、无数据时空态文案。
- **影响**：阈值即测试用例的输入/预期值；不量化则 verify 无法机械验证，违反 quality.md 硬不变量。
- **风险**：阈值定得不当 → 实现与用例返工（如 60s 分档与轮询周期 2s 的交互）。

### Q4（P1）相对时间格式细节

- **默认假设**：使用 `<time datetime="ISO">` 元素承载机器可读值，可见文本为相对时间；「刚刚」阈值 60s；≥24h 显示 `MM-DD HH:MM`。
- **影响**：影响 UI 细节与用例数，成本影响小；可按默认执行，无需等待确认。

## C. UI 约束

### Q5（P0）a11y 标准范围

- **默认假设**：遵循基础 WCAG A 级与既有模式：状态切换（连接态、stale）经 `aria-live`（复用 `role="status"` banner 或新 region）**只播报一次**；相对时间的周期性 tick **不得**触发播报；颜色非唯一信息载体（徽章态必须含文字，现有 `.pill` 已符合）；`prefers-reduced-motion` 下无动画；无新增交互控件 → 无焦点管理负担。
- **影响**：标准高低直接决定实现成本（如是否要求完整屏幕阅读器冒烟、键盘路径、对比度重审）。
- **风险**：默认标准不满足用户预期 → G1 后返工；标准过高（如逐控件 WCAG AA/AAA 审计）会显著增加成本。

### Q6（P0）textContent-only / 无 CDN / CSP 确认

- **默认假设**：
  1. 新增渲染继续只用 `textContent`（全仓 grep 不得出现 `innerHTML`/`insertAdjacentHTML`/`eval`/`new Function`）。
  2. 无 CDN、无外部字体/图片/脚本（CSP 下本就不可行，需明确无例外）。
  3. 所有 JS 保留在 `/app.js` 单文件，不新增静态文件（否则需改 `server.mjs` 路由，非必要不碰）。
  4. 不改动 CSP 头。
- **影响**：约束全部成立时改动面最小、安全面不变；任一放宽都需改服务端与安全基线。
- **风险**：违反者会引入 XSS 面或破坏现有 CSP 防线（本项目的门禁硬不变量之一）。

### Q7（P1）客户端时钟偏差

- **默认假设**：相对时间用 `Date.now() - generatedAt` 推算，接受客户端时钟偏差导致的失真（dashboard 仅本机查看、display-only、不写回）。
- **影响**：接受则零后端改动；拒绝则需服务器提供时间差字段（后端变更，成本↑）。
- **风险**：极低（本地使用场景）。

## D. 测试要求

### Q8（P0）测试层级与工具

- **默认假设**：服务端集成测试用 `node:test` + `server.mjs` 的 `runtimeDirOverride`（临时 runtime 目录 + 构造 envelope），覆盖：正常轮询、304、503（无快照）、失联（停服/畸形响应）、stale 判定、畸形 envelope 负向用例；前端行为以静态断言（grep 约束）+ 浏览器手工冒烟。**不引入 Playwright 等浏览器 E2E 依赖**（需网络下载依赖，与"无 CDN/本地"精神冲突，且当前仓库无此基础设施）。
- **影响**：不引入依赖 → 测试成本低、可离线；引入浏览器 E2E → 新依赖 + CI/环境复杂度 ↑。
- **风险**：纯服务端测试无法覆盖真实浏览器渲染行为 → 需手工冒烟补位（见 Q10）。

### Q9（P1）verify 风险分级

- **默认假设**：R1（dashboard 与 envelope 的公共契约边界 → 负向测试 + 独立验证，符合 quality.md R1 定义"模块边界"）。备选 R0（纯本地展示、无敏感数据、可逆）。
- **影响**：R1 增加一次独立验证成本；R0 成本更低但契约边界无独立验证。
- **风险**：降为 R0 则畸形 envelope 崩溃类缺陷可能在集成后才暴露。

### Q10（P1）演练数据真实度

- **默认假设**：AC 测试全部用构造 envelope 数据（确定性、可复现）；另由主会话对真实 run `snapshot.mjs publish` 后做一次浏览器人工冒烟作为补充证据。
- **影响**：构造数据保证测试确定性；真实冒烟验证真实 schema 下的渲染。
- **风险**：仅构造数据时可能漏掉真实 schema 形态问题（低概率，schema 已冻结）。

## 需用户确认汇总

- **P0 全部需确认**：Q1（范围组合）、Q2（时间线数据来源）、Q3（AC 量化锚点）、Q5（a11y 标准）、Q6（安全约束确认）、Q8（测试工具）。
- **P1 可按默认执行**：Q4、Q7、Q9、Q10（若用户有异议可在同一轮 grill-me 中回答）。
- 回答方式：主会话 `/grill-me` 或 AskUserQuestion；P0 未全部回答前不得进入 PLANNING（phases.md 退出条件）。
- 默认假设生效时机：用户对某题未表态 → 按本文默认假设执行，并在 G1 审批中显式记录（runbook：G1 批准绑定 artifact 哈希，实质变更后旧批准失效）。

## 矛盾检查声明

已核对合同正文与 `docs/architecture.md`（ADR-003 旁路只读）、`references/state-schema.md`（envelope）、`dashboard/server.mjs`（CSP/路由）、`references/phases.md`（clarify 退出条件）、`references/dfm-cost.md`（ADR-004）。**未发现矛盾**；候选范围与"旁路只读 + 快照 envelope"约束一致。若实施阶段发现新矛盾 → 停止上报，不猜测。
