```json
{
  "ac_map": [
    {
      "ac_id": "AC-P1",
      "expected_exit": 0,
      "test_command": "node scripts/tasks.mjs freeze run-20260813-001 docs/specs/dogfood-plan.json"
    }
  ],
  "allowed_tools": [
    "Read",
    "Write",
    "Glob",
    "Grep"
  ],
  "checkpoint_rule": "report-on-exit",
  "contract_id": "contract-dogfood-plan-v1",
  "contract_sha256": "sha256:5170adea4bedf208997a2481df6e188714d0b48bb913c1c9a81e474828d83bf4",
  "contract_version": 1,
  "cost_required": false,
  "deliverables": [
    {
      "kind": "design",
      "path": "docs/specs/dogfood-design.md",
      "required": true
    },
    {
      "kind": "task-dag",
      "path": "docs/specs/dogfood-plan.json",
      "required": true
    }
  ],
  "depends_on": [],
  "dfm_required": false,
  "evidence_types": [
    "document"
  ],
  "forbidden_ops": [
    "write_code",
    "deploy",
    "secret_access"
  ],
  "forbidden_paths": [
    "dashboard/",
    "scripts/",
    "contracts/",
    "run/"
  ],
  "idempotency_key": "T-PLAN",
  "input_artifacts": [
    {
      "path": "docs/specs/dogfood-brief.md",
      "sha256": "sha256:c2c362b7deabceb60781e0869f18b82050d04090d84538d13e748caa537281b5",
      "version": "G1"
    },
    {
      "path": "docs/architecture.md",
      "sha256": "sha256:unset",
      "version": "0f8b757"
    },
    {
      "path": ".claude/skills/assembly-development/references/quality.md",
      "sha256": "sha256:unset",
      "version": "0f8b757"
    }
  ],
  "manual_gate_required": true,
  "max_attempts": 2,
  "mitigations": [],
  "network_scope": [],
  "non_goals": [
    "不写实现代码",
    "不修改 envelope schema"
  ],
  "objective": "为看板可观测性增强产出技术方案与垂直任务 DAG",
  "output_schema": "plan-output",
  "owned_paths": [
    "docs/specs/"
  ],
  "parent_task_id": "T-000",
  "phase": "plan",
  "risk_level": "low",
  "run_id": "run-20260813-001",
  "schemaVersion": 1,
  "scope": {
    "exclude": [
      "dashboard/",
      "scripts/",
      "run/"
    ],
    "include": [
      "docs/specs/dogfood-design.md",
      "docs/specs/dogfood-plan.json"
    ]
  },
  "success_definition": "技术方案符合 ADR-003（旁路只读）与现有架构；DAG 含 2 个可独立实现/测试/合并的垂直任务，写范围不重叠，且通过 tasks.mjs freeze 校验",
  "task_id": "T-PLAN",
  "timeout_minutes": 15,
  "triggers": [],
  "verification_required": false,
  "worktree": null
}

```

# 狗粮演练：技术方案与任务 DAG（plan）

## 任务

1. 阅读产品简档（dogfood-brief.md）与架构文档。
2. 产出技术方案 dogfood-design.md：两个垂直任务的实现要点、文件所有权、验收与测试策略（复用 node:test + server.mjs 的 runtimeDirOverride 测试钩子）、风险登记。
3. 产出 DAG dogfood-plan.json，格式：

```json
{
  "runId": "run-20260813-001",
  "tasks": [
    { "id": "T-001", "title": "...", "contractId": "contract-dogfood-t001-v1", "dependsOn": [], "phase": "implement", "ownedPaths": ["dashboard/app.js", "dashboard/index.html", "tests/dashboard-ui.test.mjs"], "acceptance": [] },
    { "id": "T-002", "title": "...", "contractId": "contract-dogfood-t002-v1", "dependsOn": [], "phase": "implement", "ownedPaths": ["dashboard/server.mjs", "tests/dashboard.test.mjs"], "acceptance": [] }
  ]
}
```

约束：
- T-001：看板相对时间显示（60s/60min/24h 分档）+ 轮询刷新指示；前端改动；新增 tests/dashboard-ui.test.mjs（纯函数测试相对时间格式化与 stale 判断）。
- T-002：server.mjs /revision 返回 lastEventSeq（从 pointer 读取）+ 对应测试断言更新；不改 envelope schema（lastEventSeq 从 pointer 派生）。
- 两任务 ownedPaths 不得重叠；不得改共享文件（.claude/settings.json 等）。

## 停止规则

方案与 ADR/文档矛盾 → 停止上报，绝不猜测。
