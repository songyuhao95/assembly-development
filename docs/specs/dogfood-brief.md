# 产品简档 — 看板可观测性增强（dogfood）

- run_id: `run-20260813-001` ｜ task_id: `T-000` ｜ phase: `clarify`（产出物，待 G1 批准）
- 合同: `contract-dogfood-clarify-v1`（v2）｜ 前置澄清清单: `docs/specs/dogfood-questions.md`
- 状态: **PROVISIONAL** — 按澄清问题的默认假设编写，可执行；P0（Q1/Q2/Q3/Q5/Q6/Q8）经用户确认后成为 G1 批准 artifact，任一实质变更须重新批准（runbook：批准绑定 artifact sha256）。

## 一句话目标

对旁路只读仪表盘做垂直改造：新增连接状态徽章、刷新指示、相对时间显示与事件时间线，全部在现有 CSP（`script-src 'self'`）、textContent-only、无 CDN 约束下完成，作为 assembly-development v1 端到端狗粮（Step 11）。

## 范围（按默认假设）

实现仅限 `dashboard/` 下（`index.html`、`app.js`、`server.mjs` 如需微调）与必要文档（`docs/architecture.md` 可选同步；`references/state-schema.md` 仅当 Q2 选后端方案时）。

1. **连接状态徽章**（header 常驻，文字三态）：
   - 在线：最近成功轮询 ≤ 2×POLL_MS 且快照未过期；
   - 快照过期（stale）：`generatedAt + staleAfterSeconds` 已过（沿用默认 30s）；
   - 失联：fetch 异常或非 2xx/304；503 特例文案「无快照」。
   - 保留现有 banner 语义（文案复用）。
2. **刷新指示**：每次轮询完成（200 或 304）更新「已刷新 HH:MM:SS」及相对时间；失败不更新，归入徽章失联态。
3. **相对时间显示**：现有各 section 中出现的时间戳（含新时间线）以 `<time datetime="ISO">` 呈现相对文本：<60s「刚刚」、<60min「N 分钟前」、<24h「N 小时前」、≥24h「MM-DD HH:MM」；刻度 ≤60s 重算。
4. **事件时间线**：由现有 envelope 字段**客户端派生**（`approvals.approvedAt` / `risks.triggeredAt` / `worktrees.updatedAt` 合并），按时间倒序渲染，每条含事件类型、对象、绝对+相对时间；上限 50 条；无数据时空态文案。
5. **约束贯穿**：textContent-only；无 CDN/外部资源；JS 全部留在 `/app.js`（不新增静态文件）；不改 CSP 头；状态切换仅播报一次（aria-live）；颜色非唯一信息载体；`prefers-reduced-motion` 下无动画。

## 非目标

- 后端/编排变更：不修改 `scripts/`、`run/`、`contracts/` 行为（若 Q2 改为后端方案则例外，须用户明确确认）。
- 写操作/控制按钮（批准/重试/恢复）——ADR-003 明确禁止，动作必须走主会话脚本。
- 多快照历史浏览、推送/桌面通知、登录鉴权（loopback 只读）。
- 引入浏览器 E2E 依赖（Playwright 等）、CDN 字体/图标库、任何外部网络资源。
- 改动 CSP 头或新增服务端路由（非必要）。
- 原始事件流展示（envelope 不含事件；时间线仅派生，见范围 4）。

## 验收标准（AC，可量化可验证）

| AC | 描述（量化判据） | 验证方法 |
|---|---|---|
| AC-1 | 徽章三态：构造场景分别呈现「在线/快照过期/失联」，503 显示「无快照」；轮询失败后 ≤10s 内状态翻转 | node:test 服务端集成测试（临时 runtime 目录 + 构造 envelope） |
| AC-2 | 刷新指示：200 与 304 均更新「已刷新」时间；失败不更新 | 同上（注入响应序列断言） |
| AC-3 | 相对时间分档：60s/60min/24h 边界值断言（59s「刚刚」、61s「1 分钟前」等）；tick 重算 ≤60s；`<time datetime>` 存在且合法 | 纯函数单测 + 集成断言 |
| AC-4 | 时间线：构造 3 类投影事件合并倒序正确；上限 50 条截断；空数据时空态文案 | 集成测试断言顺序/条数/空态 |
| AC-5 | 回归：gates/tasks/risks/worktrees/evidence 渲染、304/503/失联 banner、`visibilitychange` 重刷行为与改动前一致 | 改动前行为对照测试 |
| AC-6 | a11y：状态切换播报每态仅一次；tick 不播报；徽章态含文字（非仅颜色）；reduced-motion 无动画 | 代码审查 + 手工冒烟（可选屏幕阅读器） |
| AC-7 | 硬不变量：全仓 grep 无 `innerHTML`/`insertAdjacentHTML`/`eval`/`new Function`/外链 `http(s)://`；CSP 头 diff 为空；无新增静态文件 | grep 命令 + `git diff` 检查 |
| AC-8 | 测试证据：`node:test` 全绿（exit 0）；每条 AC 在 `docs/specs/_template-cases.md` 模板下逐条登记（输入/操作/预期/验证/证据路径/Pass-Fail），不适用项记录理由 | test 命令 + 用例表核查 |
| AC-9 | 真实冒烟（P1）：主会话对真实 run `snapshot.mjs publish` 后，浏览器人工确认徽章/刷新指示/时间线呈现 | 人工观察记录（evidence） |

## 风险初筛

| 风险 | 级别 | 条件 | 缓解 |
|---|---|---|---|
| R1 envelope 字段缺失/畸形 → 渲染崩溃/空白 | Medium | 构造或真实快照缺字段 | 防御式读取（可选链+兜底默认值）；负向测试用例；Q9 默认 R1 独立验证 |
| R2 客户端时钟偏差致相对时间失真 | Low | 本机时钟异常 | display-only 不写回；如需精确可在 Q7 改选服务器时间差（后端变更） |
| R3 演练数据量少，时间线显空 | Low | 真实 run 事件稀疏 | 构造数据测试保证逻辑，真实冒烟补充 |
| R4 后台标签页定时器节流致刷新滞后 | Low | 浏览器节能节流 | 已存在 `visibilitychange` 回前台立即重刷 |
| R5 envelope schema 变更兼容（**仅当 Q2 选后端方案**） | Medium | 旧快照/旧客户端共存 | schemaVersion 递增 + 发布节奏单一；若客户端派生则不存在此风险 |

## DFM 判定

- **判定**：`not_applicable`（不生成 DFM 文档）。
- **理由**：纯软件改动（dashboard 前端 + 本地 `node:http` 服务）；不涉及实体硬件、BOM、PCB、外壳/机械结构、装配、加工、生产测试、良率/供应商/材料/工装/检验要求；用户未提出制造成本或供应链要求（依据 ADR-004 与 `references/dfm-cost.md` 适用性清单，全项不命中）。
- **成本注记**（合同 `cost_required: false`，仅按 dfm-cost.md 软件成本项定性评估）：构建 = 本地 node、默认零新依赖；部署 = localhost 静态、无云资源/数据库/外部 API；运行开销 = 单客户端 2s 轮询 1KB 级 envelope，可忽略。不生成量化基线，不编造数字。

## 待用户确认（进入 G1 前）

- P0：Q1 四项全做？Q2 时间线客户端派生（默认）还是后端加事件字段？Q3 AC 阈值（60s/60min/24h 分档、50 条上限、失联 ≤10s）？Q5 a11y 默认标准？Q6 安全约束（textContent-only/无 CDN/JS 单文件/CSP 不动）？Q8 不引入浏览器 E2E 依赖？
- P1 按默认：Q4 时间格式、Q7 时钟偏差接受、Q9 R1 分级、Q10 真实冒烟。
- 确认方式：主会话 `/grill-me`/AskUserQuestion；P0 未答完不得进入 PLANNING；本文件实质变更后旧 G1 批准失效。
