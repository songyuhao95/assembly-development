```json
{
  "ac_map": [
    {
      "ac_id": "AC-2",
      "expected_exit": 0,
      "test_command": "node --test tests/dashboard-ui.test.mjs"
    },
    {
      "ac_id": "AC-3",
      "expected_exit": 0,
      "test_command": "node --test tests/dashboard-ui.test.mjs"
    }
  ],
  "allowed_tools": [
    "Read",
    "Edit",
    "Write",
    "Bash:test"
  ],
  "checkpoint_rule": "report-on-exit",
  "contract_id": "contract-dogfood-t001-v1",
  "contract_sha256": "sha256:ea85c8a961c6ff28c96265e085c54d2ec95027d590be3d37671d02f91018f7c5",
  "contract_version": 1,
  "cost_required": false,
  "deliverables": [
    {
      "kind": "implementation",
      "path": "dashboard/app.js",
      "required": true
    },
    {
      "kind": "implementation",
      "path": "dashboard/index.html",
      "required": true
    },
    {
      "kind": "test",
      "path": "tests/dashboard-ui.test.mjs",
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
    "dashboard/server.mjs",
    "scripts/",
    "run/",
    "contracts/",
    "docs/"
  ],
  "idempotency_key": "T-001",
  "input_artifacts": [
    {
      "path": "docs/specs/dogfood-design.md",
      "sha256": "sha256:404be10659763a26bb2d349fb3d06b8200b0b508ac7423b958c5577ccc8b1a23",
      "version": "716ea91"
    },
    {
      "path": "docs/specs/dogfood-brief.md",
      "sha256": "sha256:c2c362b7deabceb60781e0869f18b82050d04090d84538d13e748caa537281b5",
      "version": "716ea91"
    }
  ],
  "manual_gate_required": false,
  "max_attempts": 2,
  "mitigations": [
    "现状行为即测试基线",
    "浏览器引导以 typeof document 守卫"
  ],
  "network_scope": [],
  "non_goals": [
    "不改 envelope schema",
    "不改服务端路由",
    "不引入新依赖"
  ],
  "objective": "看板相对时间显示（60s/60min/24h 分档）与轮询刷新指示",
  "output_schema": "task-report",
  "owned_paths": [
    "dashboard/app.js",
    "dashboard/index.html",
    "tests/dashboard-ui.test.mjs"
  ],
  "parent_task_id": "T-PLAN",
  "phase": "implement",
  "risk_level": "medium",
  "run_id": "run-20260813-001",
  "schemaVersion": 1,
  "scope": {
    "exclude": [
      "dashboard/server.mjs",
      "scripts/",
      "run/",
      "contracts/",
      "docs/"
    ],
    "include": [
      "dashboard/app.js",
      "dashboard/index.html",
      "tests/dashboard-ui.test.mjs"
    ]
  },
  "success_definition": "纯函数（注入 nowMs 可测）实现相对时间格式化与 stale 判断；304 响应也更新刷新指示；新增 node:test 测试全部通过；不改变 CSP、不新增静态文件",
  "task_id": "T-001",
  "timeout_minutes": 30,
  "triggers": [
    "渲染行为回归",
    "module 转换时序"
  ],
  "verification_required": false,
  "worktree": ".worktrees/run-20260813-001/T-001"
}

```

# T-001 看板相对时间显示 + 刷新指示（implement）

## 工作区

你的所有读写只允许发生在 `.worktrees/run-20260813-001/T-001/`（绝对路径：D:/install/git/songyuhao95/Project-Team/.worktrees/run-20260813-001/T-001）。仓库主目录只读。所有命令用绝对路径或在工作区内执行。

## 任务

按 docs/specs/dogfood-design.md 的 T-001 节实现：

1. app.js 转 `<script type="module">`（index.html 同步修改），导出纯函数：`formatRelative(nowMs, thenMs)`（<60s→"刚刚"，<60min→"N 分钟前"，<24h→"N 小时前"，≥24h→绝对时间）、`computeStale(generatedAt, nowMs, staleAfterSeconds)`（注入 nowMs 可测）。
2. 渲染元数据行增加相对时间文本与"刷新于"指示；200 与 304 响应都更新指示（现 304 分支不更新，需补）；失败不更新。
3. 30s tick 刷新相对时间（≤60s 约束）；reduced-motion 无动画。
4. 新增 tests/dashboard-ui.test.mjs：node:test 覆盖分档边界（59s/60s/59min/60min/23h/24h）、负值 clamp、stale 判定边界、304 更新语义（纯函数层面）。
5. 禁止改 dashboard/server.mjs、scripts/、run/、contracts/、docs/；不引入依赖；CSP 不动。

## 完成条件

- 工作区内 `node --test tests/dashboard-ui.test.mjs` 全绿；仓库现有 `node --test tests/dashboard.test.mjs` 仍全绿（工作区内运行）。
- 在工作区提交（分支 task/run-20260813-001/T-001）。
- 在仓库主目录写报告 run/reports/T-001-report.json（schema 见 tests/quality.test.mjs 的 good 样例；evidencePath 相对仓库根）。
- 最终回复包含：修改文件清单、提交 hash、测试输出摘要、报告路径。

## 停止规则

矛盾/越权/测试无法通过 → 停止上报，绝不猜测、绝不改禁止路径。
