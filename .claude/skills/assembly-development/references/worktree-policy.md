# Worktree 与集成策略

## Git 模式（默认）

- 开始前记录基线 SHA、分支、dirty/untracked 状态；**不自动 stash/reset/覆盖用户变更**。
- 每个实现任务从同一批准的 base revision 创建独立 worktree：`.worktrees/<RUN_ID>/<TASK_ID>/`，分支 `task/<RUN_ID>/<TASK_ID>`。
- subagent 只交付：提交/patch、修改文件清单、测试结果、结构化报告。
- integrate 使用独立 worktree：`.worktrees/<RUN_ID>/integration/`，按 DAG 确定顺序串行集成；冲突由集成者处理，**不确定的冲突 → BLOCKED，请求用户决策**。
- 集成并保存证据前不清理原 worktree；失败保留现场与日志，不自动 reset。
- 禁止：多个 worker 操作共享 index/ref；force push；修改生产分支。

## 无 Git 降级（DEGRADED_SERIAL_NO_GIT）

- **绝不静默 `git init`**；仅当用户明确批准后才初始化并建立 .gitignore + 基线提交。
- 用户不批准 → 串行模式：一次只运行一个写入任务。
- 每个任务记录变更前后文件清单 + sha256 快照（hash manifest）。
- 明确声明：无分支合并、回滚与冲突恢复保证；无法可靠复现交付时相关阶段标 BLOCKED，不宣称已集成。

## 清理

- 任务 done 且集成证据保存后，`git worktree remove` 清理（幂等）。
- 有未提交改动的 worktree 不得删除（防数据丢失）。
