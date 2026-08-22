你现在接手任务 {{TASK_ID}} 的故障 Rework。

[REWORK]
incident_id={{INCIDENT_ID}}
old_contract={{OLD_CONTRACT_PATH}}
new_contract={{NEW_CONTRACT_PATH}}
new_contract_sha256={{NEW_CONTRACT_SHA256}}
task_progress_notes={{TASK_PROGRESS_PATH}}
diagnosis={{DIAGNOSIS}}
required_phase={{REQUIRED_PHASE}}
required_test={{TEST_COMMAND}}
[END REWORK]

先读取新的任务合同和 `task_progress_notes`，再读取它们引用的测试、源 revision 和证据。任务清单、测试脚本、模块合同和上级 Outline 只读；只能在新合同 `owned_paths` 中修改代码和自己的 Handover。按 required_phase 重新取得 RED，再用最小实现 GREEN；完成后更新任务进度摘要和新的 Handover。若诊断、路径、接口或需求不一致，立即停止并回报项目主会话。
