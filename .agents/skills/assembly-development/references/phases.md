# 阶段定义与状态机

## 状态

```
NEW → CLARIFYING → WAITING_REQUIREMENTS_APPROVAL → PLANNING → WAITING_PLAN_APPROVAL
    → IMPLEMENTING → INTEGRATING → VERIFYING → RELEASE_CANDIDATE
    → WAITING_RELEASE_APPROVAL → DEPLOYING → POST_RELEASE_OBSERVING
    → WAITING_FINAL_ACCEPTANCE → DONE
```

异常/等待态：`WAITING_FOR_USER`、`BLOCKED`、`REWORK_REQUIRED`、`FAILED_RETRYABLE`、`RECOVERY_REQUIRED`、`ABORTED`、`DEGRADED_SERIAL_NO_GIT`。

状态只由主会话通过事件推进；subagent 不得改写主流程状态。

## 各阶段

### CLARIFYING（澄清）
- 进入：NEW + 用户需求。
- 执行：subagent 抽取目标、矛盾、未知项、风险，产出**澄清问题列表**（每个问题含优先级、不回答时的默认假设、该假设对范围/成本/风险的影响）。主会话运行提问流程（如 `/grill-me` 等提问技能，或直接多轮对话）代问并记录答案。
- 退出：P0 问题全部有答案；默认假设全部显式记录；产出产品简档（docs/ 下）。
- 禁止：subagent 替用户确定范围/预算/外部副作用；写实现代码。

### PLANNING（方案）
- 进入：G1 批准。
- 执行：需求/验收矩阵、技术方案、模块与 API/schema 契约、数据与迁移方案、风险登记、观测/部署/回滚方案、**垂直任务 DAG**（每个任务可独立实现、测试、合并）。
- 退出：`tasks.mjs freeze` 通过（无环、依赖合法、写范围不重叠）；用户 G2 批准。
- 禁止：G2 前启动任何实现。

### IMPLEMENTING（实现）
- 进入：G2 批准。
- 执行：只派发 `tasks.mjs ready` 列出的任务；每任务一个 subagent + 独立 worktree（Git）或串行降级（无 Git）。任务级测试 + 结构化报告 + 证据。
- 退出：所有任务 done；无未解决 Critical/High。
- 禁止：跨 worktree 写入；修改共享配置/锁文件（归 integrate 处理）；自改验收标准。

### INTEGRATING（集成）
- 进入：全部实现任务 done。
- 执行：独立 integration worktree 按 DAG 顺序集成；依赖方向/公共契约/数据边界/迁移兼容检查；集成测试。
- 退出：无未解决冲突；新增模块依赖环 0；集成测试全绿。
- 冲突无法机械判断 → BLOCKED，请求用户决策，绝不猜测合并。

### VERIFYING（验证）
- 进入：集成完成。
- 执行：风险触发独立验证（R2/R3 强制）：新上下文、只读/受限工作区、不接收实现者主观结论；功能/结构/安全/恢复按 quality.md 门禁。
- 退出：无未处理 Critical/High；缺陷已回流实现 worktree 并复验。
- 禁止：验证者改实现后自批；用“已运行命令”冒充证据。

### RELEASE（发布）
- 进入：验证通过 + G3（适用时）。
- 执行：`snapshot.mjs publish` 生成 envelope；用户 G4 批准精确目标/版本/窗口/回滚条件；推送（容错链）；观察。
- 退出：观察完成；G5 批准 → DONE。
- 推送全失败 → local-only 标记未发布，不宣称已发布。
