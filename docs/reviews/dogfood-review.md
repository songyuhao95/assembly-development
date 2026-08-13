# 独立验证审查报告 — run-20260813-001（T-001 + T-002）

- run_id: `run-20260813-001` ｜ 审查对象: T-001（8b4711c）、T-002（99e5f10），已合入 main（4e386c8、c341518）
- 审查人上下文: **新上下文独立验证**（不继承任何实现者结论；未写实现 worktree；只读验证 + 本报告唯一写入）
- 验证合同: `contract-dogfood-verify-v1` ｜ 结构审查依据: `.claude/skills/assembly-development/references/quality.md` §3

## 结论

- [x] **PASS**
- [ ] FAIL
- [ ] REWORK_REQUIRED

未解决 blocker/major finding = 0；2 项 minor 观察（1 项基线问题、1 项 plan 文本与合同 scope 的自相矛盾，均非本 run 新增实现缺陷，不阻断）。

## Findings（文件、位置、问题、影响、处理结果）

| # | 文件:位置 | 严重度 | 问题 | 影响 | 处理结果 |
|---|---|---|---|---|---|
| 1 | `dashboard/app.js:57,180,185` | minor（基线） | `state.bannerHidden` 只写不读（showBanner/hideBanner 赋值，无任何读取点） | 死状态，无行为影响；质量.md §1 要求基线问题与本次新增分开记录 | 基线问题（`git show 8b4711c^:dashboard/app.js` 中同样存在，非 T-001 引入）。本 run 不处理；建议后续清理任务移除此字段 |
| 2 | `docs/specs/dogfood-design.md:161`（§4.3）vs 两任务合同 forbidden_paths | minor（plan 级） | plan §4.3 要求任务在 `docs/specs/_template-cases.md` 下登记用例，但 `contract-dogfood-t001-v1`/`t002-v1` 均把 `docs/` 列为 forbidden_paths，二者互斥 | 实现者无法同时满足两者；实现选择了合同为准（正确——ac_map 的 test_command 即证据），用例以输入/预期/断言形式登记在测试文件内 | 无实现缺陷，不要求任务返工；建议 plan 所有者修订 §4.3 措辞（用例登记位置 = 测试文件，模板仅作格式参考），消除下轮演练的自相矛盾 |

## 检查清单（逐项结果）

| 检查项 | 结果 | 证据 |
|---|---|---|
| 独立复现：全量 40 项 | PASS | `node --test tests/*.test.mjs` → 40/40 pass，fail 0，exit 0（复现时间 2026-08-13） |
| 独立复现：dashboard-ui 单独 | PASS | `node --test tests/dashboard-ui.test.mjs` → 7/7 pass，exit 0 |
| 独立复现：dashboard 单独 | PASS | `node --test tests/dashboard.test.mjs` → 9/9 pass，exit 0 |
| 合同哈希（registry 校验） | PASS | `node scripts/contract.mjs validate contract-dogfood-t001-v1` / `t002-v1` 均 `ok: v1`，exit 0；报告 contractSha256 与合同 seal 值逐字一致 |
| 输入产物哈希 | PASS | `docs/specs/dogfood-design.md` @716ea91 = `sha256:404be106…1a23`，与两合同 input_artifacts 一致 |
| 报告机械闸门 | PASS | `node scripts/validate-report.mjs run/reports/T-001-report.json --root .` 与 T-002 均 exit 0（`ok: T-001 pass (2 AC, 2 commands)`） |
| owned_paths 边界（git log --stat） | PASS | T-001（8b4711c）仅改 `app.js`/`index.html`/`dashboard-ui.test.mjs`（3 文件，195+/23-）；T-002（99e5f10）仅改 `server.mjs`/`dashboard.test.mjs`（2 文件，26+/1-）；集成 diff（e2b5f1f..c341518）= 两分支文件并集 5 文件，无越界 |
| T-001 合同逐条 | PASS | module 转换 + `formatRelative(nowMs,thenMs)`/`formatAbsolute`/`renderTimeText`/`computeStale` 导出（签名与合同一致）；分档 <60s/60min/24h、负值/非有限 clamp、≥24h→null 由调用方走绝对；meta 行 `<time datetime data-relative>`；200 与 304 均更新刷新指示（304 分支补 onPollSuccess），503/非 2xx/网络异常不更新；30s tick + 轮询完成即重算；`typeof document` 守卫；reduced-motion 无动画（CSS 无任何 animation/keyframes，平凡满足） |
| T-001 测试覆盖 | PASS | 分档边界（0/59.999s/60s/61s/59min/60min/23h59m/24h）、负值 clamp、绝对格式两位补零、畸形 ISO 兜底、stale 严格 `>` 边界（31s/30s/29s/默认30s/畸形/null）、304 纯函数语义、静态断言（module 标签/刷新指示元素/document 守卫） |
| T-002 合同逐条 | PASS | `/revision` 新增 `lastEventSeq = snap.revision`，内联注释给出完整推导链；envelope schema 零变更（/snapshot.json 键集合测试锁定 12 键）；503 分支原样；CSP/路由/依赖零改动 |
| T-002 测试覆盖 | PASS | /revision 正例（键恰为 revision/generatedAt/lastEventSeq，三者一致）、游标随 rev-2 推进、503 分支保留、键集合锁定 |
| 模块依赖方向 | PASS | app.js 零 import（仅 export 纯函数），index.html `<script type="module" src="/app.js">`；server.mjs 仅 node 内置模块；测试仅 import 纯函数；无未批准跨层调用、无环 |
| 单一职责/命名 | PASS | 纯函数层与 DOM 层分离；各函数单职责；命名与设计文档术语逐字一致，无占位名 |
| 无调试输出/死代码/临时绕过/TODO | PASS（新增代码） | 新增代码无 console.log/TODO/FIXME；全部新函数均有真实调用点（formatRelative/formatAbsolute/renderTimeText/computeStale/isStale/onPollSuccess/updateRefreshIndicator/refreshRelativeTimes）；`lastSuccessAt` 由原只写变为现读（改善）；基线死状态见 F1 |
| 新抽象有真实使用者 | PASS | 全部纯函数被 DOM 层与测试消费；`lastEventSeq` 为合同交付物本身（API 字段），测试断言其值与推进，plan §3.1 文档化语义（客户端免全量拉取的未来契约），非代码级死抽象 |
| 注释质量 | PASS | 注释解释非显然决策：304 语义、lastEventSeq 推导链、30s tick 裕量选择、module 化原因、现状 `>` stale 语义锁定；未复述代码 |
| 安全边界/错误处理/资源生命周期 | PASS | textContent-only 渲染（createElement+textContent，无 innerHTML/insertAdjacentHTML/eval/new Function/document.write）；fetch 失败→错误横幅不更新指示；readSnapshot 防御路径（pointer 缺失/畸形→503）原样复用；fixture 用 os.tmpdir() 不污染仓库 |
| 安全快查（diff 层） | PASS | 两任务 diff 无 innerHTML/eval/外链脚本/秘密；CSP 常量在集成 diff 中零改动（server.mjs 仅 /revision 分支 6+/1-）；无新增静态文件；dashboard/ 内仅 3 处 `http://127.0.0.1`（loopback 构造 URL，非外链） |

## 报告交叉验证（run/reports/*.json claims vs 实测）

| claim | 实测 | 一致 |
|---|---|---|
| T-001 status=pass；AC-2/AC-3 pass（证据 tests/dashboard-ui.test.mjs） | 该测试文件 7/7 exit 0；报告命令复现 exit 0 | ✓ |
| T-001 changedFiles 3 文件 | 与 8b4711c 实际 diff 逐字一致 | ✓ |
| T-001 commandsRun 含 dashboard.test.mjs exit 0 | 复现 exit 0（合同完成条件要求既有测试不回归） | ✓ |
| T-002 status=pass；AC-5/AC-8 pass（证据 tests/dashboard.test.mjs） | 该测试文件 9/9 exit 0；报告命令复现 exit 0 | ✓ |
| T-002 changedFiles 2 文件 | 与 99e5f10 实际 diff 逐字一致 | ✓ |
| 两报告 contractSha256 | 与合同 seal 值一致（registry validate 通过） | ✓ |
| 全量测试绿色（报告未明示，集成声明隐含） | 全量 40/40 exit 0 | ✓ |

**与实现者自报不一致处：无。** 所有命令退出码、AC 覆盖、文件清单、哈希与实测一致。

## 环境备注

- `run/events.ndjson` 在本验证期间持续追加 `tool.audit` 事件（hooks 设计内行为，有活动 run 时记录工具调用审计）；非验证操作写入，符合状态层"events 真源"设计。
- 本报告为唯一写入文件；dashboard/、scripts/、contracts/、tests/、run/ 均未改动。
