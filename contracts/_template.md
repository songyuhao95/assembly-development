```json
{
  "schemaVersion": 1,
  "run_id": "run-YYYYMMDD-NNN",
  "task_id": "T-001",
  "parent_task_id": null,
  "phase": "implement",
  "contract_id": "contract-T-001-v1",
  "contract_version": 0,
  "objective": "一句话目标",
  "success_definition": "可验证的成功定义（含量化阈值或明确证据）",
  "scope": { "include": [], "exclude": [] },
  "non_goals": [],
  "input_artifacts": [ { "path": "docs/architecture.md", "version": "commit-sha", "sha256": "sha256:<hex>" } ],
  "depends_on": [],
  "owned_paths": ["src/x/", "tests/x/"],
  "forbidden_paths": [],
  "worktree": null,
  "allowed_tools": ["Read", "Edit", "Write", "Bash:test"],
  "forbidden_ops": ["deploy", "force_push", "secret_access"],
  "network_scope": [],
  "deliverables": [ { "path": "src/x/y.ts", "kind": "implementation", "required": true } ],
  "output_schema": "task-report",
  "evidence_types": ["test-result", "diff"],
  "ac_map": [ { "ac_id": "AC-1", "test_command": "npm run test:x", "expected_exit": 0 } ],
  "verification_required": false,
  "manual_gate_required": false,
  "dfm_required": false,
  "cost_required": false,
  "risk_level": "low",
  "triggers": [],
  "mitigations": [],
  "timeout_minutes": 30,
  "max_attempts": 2,
  "idempotency_key": "T-001",
  "checkpoint_rule": "report-on-exit"
}
```

# 任务说明（正文）

<!-- 人类可读的任务描述：目标、步骤、验收、风险、停止规则。seal 时仅 frontmatter 参与哈希，正文修改需人工判断是否要新版本。 -->

## 停止规则（必填）

发现文档矛盾 / 与代码基线不一致 / 安全风险 / 不可行要求 / 未定义行为 → 停止相关部分并上报，绝不猜测或静默偏离。
