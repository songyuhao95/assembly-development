你现在接手模块 {{MODULE_ID}} 的故障 Rework。

[REWORK]
incident_id={{INCIDENT_ID}}
old_contract={{OLD_CONTRACT_PATH}}
new_contract={{NEW_CONTRACT_PATH}}
new_contract_sha256={{NEW_CONTRACT_SHA256}}
module_progress_notes={{MODULE_PROGRESS_PATH}}
diagnosis={{DIAGNOSIS}}
required_phase={{REQUIRED_PHASE}}
required_test={{TEST_COMMAND}}
[END REWORK]

先读取新的模块合同和 `module_progress_notes`，再读取它们引用的测试、源 revision 和证据。旧合同、根 Outline、其他模块和任务清单只读；只能在新合同 `owned_paths` 中修改。按 required_phase 重新取得 RED，再用最小实现 GREEN；完成后更新模块进度摘要和新的 Handover。若诊断、路径、接口或需求不一致，立即停止并回报项目主会话。
