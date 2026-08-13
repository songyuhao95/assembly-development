```json
{
  "ac_map": [
    {
      "ac_id": "AC-5",
      "expected_exit": 0,
      "test_command": "node --test tests/dashboard.test.mjs"
    },
    {
      "ac_id": "AC-8",
      "expected_exit": 0,
      "test_command": "node --test tests/dashboard.test.mjs"
    }
  ],
  "allowed_tools": [
    "Read",
    "Edit",
    "Write",
    "Bash:test"
  ],
  "checkpoint_rule": "report-on-exit",
  "contract_id": "contract-dogfood-t002-v1",
  "contract_sha256": "sha256:d804abc92e3766dd28760f860ee51229ccc32589af3553e8878a7df2c1278196",
  "contract_version": 1,
  "cost_required": false,
  "deliverables": [
    {
      "kind": "implementation",
      "path": "dashboard/server.mjs",
      "required": true
    },
    {
      "kind": "test",
      "path": "tests/dashboard.test.mjs",
      "required": true
    }
  ],
  "depends_on": [],
  "dfm_required": false,
  "evidence_types": [
    "test-result",
    "diff"
  ],
  "forbidden_ops": [
    "deploy",
    "force_push",
    "secret_access",
    "merge"
  ],
  "forbidden_paths": [
    "dashboard/app.js",
    "dashboard/index.html",
    "scripts/",
    "run/",
    "contracts/",
    "docs/"
  ],
  "idempotency_key": "T-002",
  "input_artifacts": [
    {
      "path": "docs/specs/dogfood-design.md",
      "sha256": "sha256:404be10659763a26bb2d349fb3d06b8200b0b508ac7423b958c5577ccc8b1a23",
      "version": "716ea91"
    }
  ],
  "manual_gate_required": false,
  "max_attempts": 2,
  "mitigations": [
    "测试锁定 /snapshot.json 键集合",
    "语义定义写入内联注释"
  ],
  "network_scope": [],
  "non_goals": [
    "不改 envelope schema",
    "不改 CSP",
    "不新增路由",
    "不引入新依赖"
  ],
  "objective": "server.mjs /revision 返回 lastEventSeq（从 pointer 派生），不改 envelope schema",
  "output_schema": "task-report",
  "owned_paths": [
    "dashboard/server.mjs",
    "tests/dashboard.test.mjs"
  ],
  "parent_task_id": "T-PLAN",
  "phase": "implement",
  "risk_level": "medium",
  "run_id": "run-20260813-001",
  "schemaVersion": 1,
  "scope": {
    "exclude": [
      "dashboard/app.js",
      "dashboard/index.html",
      "scripts/",
      "run/",
      "contracts/",
      "docs/"
    ],
    "include": [
      "dashboard/server.mjs",
      "tests/dashboard.test.mjs"
    ]
  },
  "success_definition": "/revision 响应新增 lastEventSeq 字段且值与 revision 一致（语义为事件流游标）；/snapshot.json 键集合不变；现有 dashboard 测试更新并全绿",
  "task_id": "T-002",
  "timeout_minutes": 30,
  "triggers": [
    "越界改 envelope schema",
    "lastEventSeq 被当作冗余删除"
  ],
  "verification_required": false,
  "worktree": ".worktrees/run-20260813-001/T-002"
}

```

# T-002 /revision 增加 lastEventSeq（implement）

## 工作区

你的所有读写只允许发生在 `.worktrees/run-20260813-001/T-002/`（绝对路径：D:/install/git/songyuhao95/Project-Team/.worktrees/run-20260813-001/T-002）。仓库主目录只读。所有命令用绝对路径或在工作区内执行。

## 任务

按 docs/specs/dogfood-design.md 的 T-002 节实现：

1. dashboard/server.mjs 的 `/revision` 响应体新增 `lastEventSeq`（值 = snapshot.revision，语义：事件流游标；内联注释说明推导链）。
2. 不改 envelope schema（/snapshot.json 键集合原样）；503 分支不变。
3. 更新 tests/dashboard.test.mjs：断言 /revision 返回 lastEventSeq 且与 revision 一致；新增断言 /snapshot.json 键集合不变。
4. 禁止改 dashboard/app.js、dashboard/index.html、scripts/、run/、contracts/、docs/；不引入依赖。

## 完成条件

- 工作区内 `node --test tests/dashboard.test.mjs` 全绿。
- 在工作区提交（分支 task/run-20260813-001/T-002）。
- 在仓库主目录写报告 run/reports/T-002-report.json（schema 同 quality.test.mjs good 样例；evidencePath 相对仓库根）。
- 最终回复包含：修改文件清单、提交 hash、测试输出摘要、报告路径。

## 停止规则

矛盾/越权/测试无法通过 → 停止上报，绝不猜测、绝不改禁止路径。
