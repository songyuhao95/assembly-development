# 任务合同

文件：`contracts/<CONTRACT_ID>.md`。顶部 JSON frontmatter（canonical 元数据），正文为人类可读的任务说明。`contract.mjs seal` 抽取 frontmatter、规范化（键递归排序）、计算 sha256（排除 contract_sha256 自身），写入 contract_version 与 contract_sha256。

## frontmatter 字段（schemaVersion: 1）

```json
{
  "schemaVersion": 1,
  "run_id": "run-20260813-001",
  "task_id": "T-001",
  "parent_task_id": null,
  "phase": "implement",
  "contract_id": "contract-T-001-v1",
  "contract_version": 1,
  "contract_sha256": "sha256:<hex>",
  "objective": "一句话目标",
  "success_definition": "可验证的成功定义",
  "scope": { "include": [], "exclude": [] },
  "non_goals": [],
  "input_artifacts": [ { "path": "docs/architecture.md", "version": "commit-sha", "sha256": "<hex>" } ],
  "depends_on": [],
  "owned_paths": ["src/x/", "tests/x/"],
  "forbidden_paths": ["src/auth/"],
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
  "risk_level": "medium",
  "triggers": [],
  "mitigations": [],
  "timeout_minutes": 30,
  "max_attempts": 2,
  "idempotency_key": "T-001",
  "checkpoint_rule": "report-on-exit"
}
```

## 阶段合同模板

- **clarify**：objective=产出澄清问题列表；deliverables=问题清单（结构化）；forbidden_ops 含 "decide_scope"、"write_code"。
- **plan**：objective=方案与任务 DAG；deliverables=需求矩阵、风险登记、技术方案、DAG 草稿（供 tasks.mjs freeze）。
- **implement**：垂直任务；owned_paths/forbidden_paths 必填且互斥于其他并行任务；ac_map 每条对应可执行命令。
- **integrate**：inputs=各任务 commit/报告；owned_paths=integration worktree；禁止自动猜测冲突。
- **verify**：`verification_required: true`；can_modify_source: false（写入 forbidden_paths=实现路径）；证据只认可复核命令输出。
- **release**：manual_gate_required: true；deliverables=release snapshot、回滚说明、已知限制。

## seal 规则

1. 未 seal 的合同不得派发。
2. seal 后实质修改 → contract_version +1、新 sha256；旧批准（gate.mjs 绑定的 artifact 哈希）自动失效。
3. 合同内容与开发文档冲突 → subagent 停止上报；主会话创建新版本合同或 ADR，经用户批准后继续。
