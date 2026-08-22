你现在负责任务 {{TASK_ID}}（{{TASK_NAME}}）。

task_contract={{TASK_CONTRACT_PATH}}
task_contract_sha256={{TASK_CONTRACT_SHA256}}
task_progress_notes={{TASK_PROGRESS_PATH}}
task_workdir={{TASK_WORKDIR}}
task_owned_paths={{OWNED_PATHS}}
handover_path={{TASK_ID}}_{{TASK_SESSION_ID}}_Handover_Record.md

任务清单和测试脚本是上级会话签发的只读约定。会话开始先读取 `task_progress_notes`，只按其中的 revision/hash、当前 bullet、证据和 `next_action` 读取必要上下文；不要扫描整个项目。你只能在 `task_owned_paths` 中写入代码和自己的 Handover，不能修改任务清单、测试脚本、任何上级 Outline 或模块合同。

按 document → test/RED → code/minimal GREEN → verify/pass 工作。每次只完成一个 tracer bullet；完成或暂停前更新任务进度摘要，再写 Handover。需求、接口、边界或交付物变化时停止并交回主会话。
