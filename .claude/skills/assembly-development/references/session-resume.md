# 分层会话恢复协议

本协议解决大项目的上下文过载问题。会话恢复先读本层的最新进度摘要，再按摘要中的指针读取必要材料；不从项目根目录递归扫描开始。

## 文件角色与所有权

| 层级 | 不可变约定 | 可写进度摘要 | 写入者 |
|---|---|---|---|
| 项目 | `Outline_Notes.md` 的目标、约定、架构和任务清单 | 同一个 `Outline_Notes.md` 的最新进度区 | 项目主会话 |
| 模块 | `M01_Module_Outline_Notes.md` 模块合同 | `M01_Outline_Notes.md` | 当前模块会话 |
| 任务 | `001_任务名称.md` 任务清单和测试脚本 | `001_Outline_Notes.md` | 当前任务会话 |

模块合同、任务清单和测试脚本始终只读。进度摘要是它们的 companion，不是覆盖或替代。

## 进度摘要必须包含

```text
owner_session_id: 唯一会话 ID
role: project-main | module-main | task-agent
parent_contract: 路径
contract_sha256: sha256:...
phase: document | test/RED | code/minimal GREEN | verify/pass
active_bullet: 当前 tracer bullet 或 null
completed: 本层最近完成事项
pending: 本层剩余事项
next_action: 下一次会话可以直接执行的一条命令或动作
task_revision: 当前任务清单 revision
test_revision: 当前测试 revision
evidence_path: 最新机器证据路径或 null
evidence_sha256: 最新机器证据哈希或 null
blockers: 阻塞和需要主会话决定的事项
owned_paths: 本会话可写路径摘要
updated_at: UTC 时间
```

只保留最新状态；详细命令、历史尝试和交接原因写入本会话的 Handover，不把进度文件变成长日志。

## 新会话最小读取顺序

1. 确认自己的 `role`、session ID 和工作目录。
2. 读取自己的进度摘要；如果不存在，停止并向上级报告，不猜测状态。
3. 校验 `contract_sha256`、`task_revision`、`test_revision` 和 `evidence_sha256` 是否仍匹配文件。
4. 只读取 `parent_contract`、当前 active bullet 的测试和 `evidence_path` 指向的最新证据；不要读取无关模块或其他任务。
5. 执行 `next_action`。若命令、接口、路径或需求已变化，回到 document；若测试表达错误，回到 test/RED。
6. 完成一个 bullet 或暂停前，原子更新进度摘要，再写本会话 Handover。

## 失效条件

以下任一情况都视为 stale，必须暂停而不是继续写代码：进度摘要的 owner/session 不匹配；合同、任务或测试 hash 变化；证据指向不存在或已过期的源 revision；`next_action` 超出 `owned_paths`；摘要显示 blocker 未解除。
