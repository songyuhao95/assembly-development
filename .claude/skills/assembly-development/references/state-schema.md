# 状态 schema

## 目录

```
run/
├── events.ndjson        # 运行事实真源（append-only，提交）
├── tasks/<RUN_ID>.json  # G2 冻结计划（提交，冻结后不改写）
├── reports/             # subagent 结构化报告与证据索引（提交）
├── snapshots/           # 发布 envelope（gitignore，可重建）
├── projections/         # state/approvals/risks/worktrees/evidence（gitignore，可重建）
└── .runtime/            # active-run、dashboard.pid、current-snapshot 指针（gitignore）
```

## 事件（单行 JSON，schemaVersion: 1）

```json
{
  "schemaVersion": 1,
  "eventId": "evt-...",
  "at": "ISO8601",
  "type": "run.start|phase.enter|task.assign|task.start|task.done|gate.approved|evidence.recorded|risk.triggered|session.start|user.prompt|tool.failure|subagent.stop|turn.stop|turn.failure|snapshot.released|remote.push_attempt|remote.push_ok|remote.push_fallback",
  "runId": "run-...",
  "phase": "implement",
  "taskId": "T-001",
  "contractId": "contract-T-001-v1",
  "agentId": null,
  "actor": "main|subagent|human|hook|script",
  "payload": {}
}
```

- 追加规则：一次系统调用写一行；崩溃残留的不完整尾行由读端忽略；解析失败 → fail-closed。
- 幂等：相同 (type, taskId, payload 关键字段) 的重复事件被去重；同 entity 不同内容 → RECOVERY_REQUIRED。
- 秘密/大段日志不进入 payload；引用 evidence_id/sha256。

## 投影（由 events 确定性重建）

- `state.json`：{runId, phase, revision, taskStatuses{}, gateStates{}, updatedAt}
- `approvals.json`：[{gate, artifact, sha256, approvedAt, by, eventId}]
- `risks.json`：[{id, level, condition, status, triggeredAt, verifyTaskId, eventId}]
- `worktrees.json`：[{taskId, path, branch, base, status, updatedAt}]
- `evidence.json`：[{taskId, contractId, kind, path, sha256, verdict, eventId}]

## snapshot envelope

```json
{
  "schemaVersion": 1,
  "revision": "<lastEventId>",
  "runId": "run-...",
  "phase": "implement",
  "generatedAt": "ISO",
  "staleAfterSeconds": 30,
  "state": {},
  "tasks": [],
  "approvals": [],
  "risks": [],
  "worktrees": [],
  "evidence": []
}
```

发布：所有投影写临时文件 → 原子 rename 到 `run/snapshots/<revision>.json` → 原子替换 `run/.runtime/current-snapshot.json` 指针。UI 只读指针指向的不可变文件。
