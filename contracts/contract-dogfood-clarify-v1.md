```json
{
  "ac_map": [
    {
      "ac_id": "AC-Q1",
      "expected_exit": 0,
      "test_command": "node scripts/contract.mjs validate contract-dogfood-clarify-v1"
    }
  ],
  "allowed_tools": [
    "Read",
    "Write",
    "Glob",
    "Grep"
  ],
  "checkpoint_rule": "report-on-exit",
  "contract_id": "contract-dogfood-clarify-v1",
  "contract_sha256": "sha256:c2eaa336301889ceba05e6287cef96e5ee058596ab5b918be1941de87f9deba9",
  "contract_version": 2,
  "cost_required": false,
  "deliverables": [
    {
      "kind": "clarification-questions",
      "path": "docs/specs/dogfood-questions.md",
      "required": true
    },
    {
      "kind": "product-brief",
      "path": "docs/specs/dogfood-brief.md",
      "required": true
    }
  ],
  "depends_on": [],
  "dfm_required": false,
  "evidence_types": [
    "document"
  ],
  "forbidden_ops": [
    "decide_scope",
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
  "idempotency_key": "T-000",
  "input_artifacts": [
    {
      "path": ".claude/skills/assembly-development/SKILL.md",
      "sha256": "sha256:unset",
      "version": "0f8b757"
    },
    {
      "path": ".claude/skills/assembly-development/references/phases.md",
      "sha256": "sha256:unset",
      "version": "0f8b757"
    },
    {
      "path": "docs/architecture.md",
      "sha256": "sha256:unset",
      "version": "0f8b757"
    }
  ],
  "manual_gate_required": true,
  "max_attempts": 2,
  "mitigations": [],
  "network_scope": [],
  "non_goals": [
    "不修改任何实现代码",
    "不替用户决定范围与预算"
  ],
  "objective": "为狗粮演练需求（看板可观测性增强）生成澄清问题清单",
  "output_schema": "clarify-output",
  "owned_paths": [
    "docs/specs/"
  ],
  "parent_task_id": null,
  "phase": "clarify",
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
      "docs/specs/dogfood-*.md"
    ]
  },
  "success_definition": "产出结构化问题清单（每问含优先级、默认假设、对范围/成本/风险的影响），并给出按默认假设可执行的产品简档",
  "task_id": "T-000",
  "timeout_minutes": 15,
  "triggers": [],
  "verification_required": false,
  "worktree": null
}

```

# 狗粮演练：看板可观测性增强（澄清）

## 原始需求（来自已批准的实施计划 Step 11）

对 dashboard 做真实垂直改造，作为 assembly-development v1 的端到端狗粮任务。候选范围：看板增加相对时间显示与刷新指示、事件时间线、连接状态徽章。

## 任务

1. 阅读输入 artifact 中与本演练相关的设计（dashboard 旁路只读、快照 envelope）。
2. 生成澄清问题清单，覆盖：范围取舍、验收标准、UI 约束（a11y、textContent-only）、测试要求。
3. 为每个问题给出优先级、默认假设、该假设的影响。
4. 按默认假设产出产品简档（范围/非目标/AC/风险）。

## 停止规则

发现与文档矛盾或不可行要求 → 停止并上报，绝不猜测。
