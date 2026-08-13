# assembly-development

流水线式多 agent 开发编排：**主会话协调 + 任务合同驱动的短生命周期 subagent 流水线**。

没有“产品经理 / 架构师 / 前端 / 后端”这些角色人格。主会话是唯一控制平面，负责用户交互、人工审批和阶段推进；每个普通 `general-purpose` subagent 只接受一份经过批准、权限最小化、可验证的**任务合同**，执行后交回证据。

## 流程

```
clarify（澄清问题，主会话代问）
  → G0/G1 人工批准
  → plan（技术方案 + 任务 DAG，冻结为 run/tasks/<RUN_ID>.json）
  → G2 人工批准
  → implement（每个垂直任务一个 worktree，可并行）
  → integrate（独立 integration worktree，按 DAG 串行集成）
  → verify（风险触发的独立验证 + 授权范围内安全测试）
  → G3/G4/G5 人工批准 → release（快照 + 交付）
```

## 四层控制

1. **Skill 指令**：流程、合同、门禁的顺序与红线（`.claude/skills/assembly-development/`）。
2. **持久状态**：`run/events.ndjson` 是运行事实真源（append-only），投影全部由事件重建（`scripts/state.mjs`）。
3. **任务 DAG**：G2 冻结的依赖图，只启动依赖已完成的任务（`scripts/tasks.mjs`）。
4. **hooks/permissions**：`.claude/settings.json` 注册；hook 是硬边界（本机默认 bypassPermissions 时尤其如此）。

## 快速开始

```bash
# 1. 依赖自检（grill-me、web-design-guidelines、design-taste-frontend、
#    ui-ux-pro-max、代码整理 skill；缺失项经你批准后安装）
node scripts/self-test.mjs

# 2. 开始流水线（主会话内）
/assembly-development start <你的需求>

# 3. 实时跟进（只读旁路仪表盘）
node scripts/dashboard-start.mjs   # 打印 http://127.0.0.1:<port>/
node scripts/dashboard-stop.mjs
```

人工门禁 G0–G5 的定义见 `docs/runbook.md`。**沉默、模糊回答或模型推断都不构成批准。**

## 目录

- `.claude/skills/assembly-development/` — 编排 Skill（SKILL.md + references）
- `.claude-plugin/plugin.json` — 插件清单（skills 指向 `./.claude/skills`，同一份 skill 双发现）
- `scripts/` — 状态/合同/DAG/Gate/风险/快照/远程/dashboard 脚本（Node ESM，fail-closed）
- `dashboard/` — 只读旁路仪表盘（127.0.0.1 随机端口，仅 GET）
- `docs/` — 架构、runbook、依赖清单、ADR
- `contracts/` — 任务合同（Markdown + JSON frontmatter，seal 后哈希锁定）
- `run/` — events.ndjson（提交）、tasks/（冻结计划）、reports/（证据）；snapshots/projections/.runtime 可重建不入库

## 注意事项

- 流水线会话建议用 `--permission-mode default` 启动（hook 才是硬边界）。
- Git 模式每任务一个 worktree；无 Git 时自动降级为串行模式，**绝不静默 `git init`**。
- 仪表盘失败不影响编排，可随时重启。
