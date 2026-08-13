# 架构

## 总体形态

主会话（coordinator）+ 短生命周期普通 subagent（executors）。职责由**阶段**和**任务合同**表达。

```
用户 ── 主会话（唯一控制平面：grill-me/AskUserQuestion、审批、合同、阶段推进、恢复）
         │ 注入合同（机械身份 + 范围 + 步骤 + 验收 + 证据）
         ├── clarify subagent（生成问题，不替用户决策）
         ├── plan subagent（需求矩阵/技术方案/风险/任务 DAG）
         ├── implement subagent × N（每垂直任务一个 worktree）
         ├── integrate subagent（独立 worktree，按 DAG 串行集成）
         └── verify subagent（新上下文独立验证，只读/受限）
```

## 机械身份

每次 subagent 派发必须携带磁盘合同引用，不信任模型自报字段：

```
RUN_ID + TASK_ID + PHASE + CONTRACT_ID + CONTRACT_VERSION + CONTRACT_SHA256
```

- 合同是 `contracts/<CONTRACT_ID>.md`（JSON frontmatter 为 canonical 元数据）。
- `contract.mjs seal` 计算规范化 sha256；实质修改 → 新版本新哈希 → 旧审批自动失效。
- 权威值以磁盘为准；hook 与门禁按需查对。

## 真源模型（ADR-001：事件优先）

- `run/events.ndjson`：append-only 运行事实真源，单行 JSON，单写者 + 单次写一行；崩溃残留的不完整尾行被忽略。
- `run/tasks/<RUN_ID>.json`：G2 冻结计划（DAG + 合同引用），冻结后不改写。
- `run/projections/{state,approvals,risks,worktrees,evidence}.json`：全部由事件确定性重建（gitignore，可随时删除）。
- `run/snapshots/<revision>.json`：统一发布 envelope，UI 只读它，避免多文件混读。

## 四层控制

| 层 | 组件 | 职责 |
|---|---|---|
| 指令 | SKILL.md + references | 流程、合同模板、门禁、红线 |
| 状态 | events + 投影 + tasks.json | 事实、进度、依赖、审批 |
| 门禁 | hooks + permissions | 机械阻断：危险命令、范围、完成证据 |
| 编排增强 | Workflow（后续版本） | 已批准阶段内的确定性 fan-out |

## 仪表盘（ADR-003：旁路只读）

- Node `node:http`，绑定 127.0.0.1:0，仅 GET/HEAD。
- 全内存路由，不做请求路径到文件系统的解析（无路径遍历面）。
- 只读当前 revision 的 snapshot envelope；断线/过期显示 stale。
- dashboard 失败不影响编排（无 await/无依赖/不写事件）。

## 降级

- 无 Git：串行 + 前后快照 + hash manifest，标记 `DEGRADED_SERIAL_NO_GIT`；绝不静默 `git init`。
- 推送失败：容错链（默认 TLS → schannel → ssh → 经用户确认一次性 sslVerify=false），全失败 local-only 并标记未发布。

## 平台适配层

同一套流程、合同、状态脚本在两个客户端上运行：

| 层 | Claude Code | Codex CLI |
|---|---|---|
| Skill 真源 | `.claude/skills/assembly-development/` | `.agents/skills/assembly-development/`（references 与 Claude 副本字节一致，sync 测试保证） |
| 会话指令 | SKILL.md（自动发现） | SKILL.md + `AGENTS.md` |
| 硬阻断（命令黑名单） | `.claude/settings.json` permissions.deny + PreToolUse hook | `.codex/rules/*.rules`（execpolicy forbidden，`--yolo` 不可绕过）+ PreToolUse hook |
| 生命周期门禁 | `.claude/settings.json` hooks（7 事件） | `.codex/hooks.json`（6 事件，复用同一批脚本；无 PostToolUseFailure/StopFailure，由 PostToolUse 自适应） |
| 执行代理 | `general-purpose` + 合同注入 | `asm-worker`（workspace-write）/ `asm-verifier`（read-only）+ 合同注入 |
| 状态/合同/门禁/DAG/仪表盘 | 同一批 `scripts/*.mjs`（平台无关） | 同左 |
| 前提 | — | 项目需被 trust 才能加载项目级 rules/hooks/config |

两个平台都遵守同一纪律：合同未 seal 不派发、Gate 未批准不推进、报告无证据不通过。
