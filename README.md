# assembly-development

`assembly-development` 是一个帮助 AI Agent 协作开发的软件交付 Skill。它的重点不是“让 Agent 自己写更多代码”，而是让每一次开发都有清楚的目标、边界、测试和交接记录。

## 设计思想

- **主会话负责方向**：主会话和用户确认需求、方案、任务拆分、进度和最终交付；下级会话只执行被分配的工作。
- **先文档、再测试、后代码**：需求不清楚不能直接写代码；测试必须先证明目标行为还不存在（RED）。
- **Tracer bullet 小步交付**：一个任务内部按“一个测试 → 一小段实现 → 通过 → 下一个测试”推进。每一步都能独立验证，失败时容易定位。
- **按目录分工**：项目、模块、任务分别拥有自己的 Outline、任务清单和 Handover。下级会话不能修改上级约定或测试文件。
- **机器证据优先**：任务是否完成由测试退出码、测试结果、源文件哈希和 Handover 证据判断，不以 Agent 的口头说明为准。
- **代码仓库独立**：消费项目的 `app/` 是独立 Git 仓库，只放最终代码；流程文档、合同、测试证据留在项目控制目录。

## 工作流程

唯一的用户可见流程是：

```text
document → test/RED → code/minimal GREEN → verify/pass
```

1. **document**：把模糊需求变成明确约定，再形成方案和可测试的任务清单。项目主会话维护 `Outline_Notes.md`。
2. **test/RED**：测试 owner 先写行为测试，证明新行为会失败；测试文件和版本被冻结。
3. **code/minimal GREEN**：实现会话只完成当前 tracer bullet，只修改任务合同允许的目录；测试通过后才能进入下一步。
4. **verify/pass**：主会话检查所有机器证据、任务交付物、模块结果和项目结果。需求、接口或交付物改变时，回到 document；测试写错时，回到 test/RED。

## 四层控制

1. **Skill 指令**：规定阶段顺序、角色、任务合同、Handover 格式和禁止事项。
2. **持久状态**：项目的 `run/events.ndjson` 记录事实；任务报告和机器证据可以据此重建。
3. **任务与目录边界**：任务清单写明交付物、测试命令、允许修改的路径和禁止路径；模块合同与项目 Outline 对下级只读。
4. **hooks / permissions / 验证**：平台 hook 和规则可以在匹配时提醒或阻止危险操作；测试、哈希、manifest 和主会话合并检查负责最后准入。

> 重要限制：Markdown 说明和 Skill 本身是软约束，不能单独提供不可绕过的文件系统权限。真正的硬阻断取决于平台 sandbox、ACL、execpolicy 和已加载的 hook。没有这些能力时，主会话必须依靠路径检查、差异检查和机器证据拒绝违规交付物。

## 安装与更新

在任意终端执行：

```bash
# 同时安装 Claude Code 和 Codex 支持（推荐）
npx github:songyuhao95/assembly-development

# 只安装一个客户端
npx github:songyuhao95/assembly-development --claude
npx github:songyuhao95/assembly-development --codex

# 更新已安装文件；默认不会覆盖用户已有文件
npx github:songyuhao95/assembly-development --force
```

安装器会把运行时脚本和模板放到用户级 `~/.assembly-development/`，把 Skill 放到 `~/.claude/skills/` 与 `~/.agents/skills/`，并合并 Claude hooks、Codex hooks/rules。安装不会把项目的合同、测试、日志或代码复制到用户目录。

安装后可以用隔离目录做验证：

```bash
node scripts/install-cli.mjs --all --home <temporary-home> --report <result.json> --quiet
node "~/.assembly-development/scripts/self-test.mjs"
```

本项目不提供 Web 仪表盘。进度通过 `Outline_Notes.md`、任务清单、Handover、`run/events.ndjson` 和测试命令查看，避免额外启动服务和端口管理。

## 如何调用

在要开发的项目中：

1. 先安装 Skill，并确认当前客户端已经加载它。
2. 在主会话中调用 `assembly-development` Skill。
3. 主会话分配唯一会话 ID，读取或创建项目根 `Outline_Notes.md`。
4. 需求确认、方案确认后，主会话创建模块合同或任务清单，再按合同派发实现会话。
5. 每个任务会话先读取自己的 `<任务编号>_Outline_Notes.md`，按其中的 `next_action` 开始；再按 RED → 最小 GREEN 循环开发，并维护自己的 Handover。
6. 主会话只接收测试通过且路径、哈希、交付物都符合约定的结果，最后合并 `app/` 并提交 Git。

## 跨客户端混用

Claude Code 和 Codex 共享同一套项目事实：任务清单、合同、`run/events.ndjson`、测试证据和 Handover。可以用 Claude 写文档、用 Codex 写代码，或反过来。

切换客户端时：

1. 先读取本层进度文件：项目主会话读 `Outline_Notes.md`，模块会话读 `M01_Outline_Notes.md`，任务会话读 `<任务编号>_Outline_Notes.md`。
2. 只按进度文件中的合同、任务、测试和证据哈希读取必要上下文；不要扫描整个项目。
3. 执行 `next_action`，再读取 Handover 和最新机器证据确认状态；不要跳过 RED，也不要覆盖旧会话的 Handover。

## 跨会话和模块使用

小项目直接由主会话拆分任务并派发 subagent。项目较大且能按独立业务能力划分时，主会话在 Outline 完成后再询问是否拆模块。

模块模式的边界：

- 主会话创建 `M01_Module_Outline_Notes.md`，写明模块目标、工作目录、交付标准和禁止路径。
- 模块会话只能修改模块工作目录内的 `M01_Outline_Notes.md` 进度摘要、任务清单、代码和自己的模块 Handover，绝不能修改 `M01_Module_Outline_Notes.md`。
- 任务清单命名为 `编号_任务名称.md`，明确测试脚本、交付文件、允许目录和最后一行 `test=true/false` 及机器证据；任务会话另维护同目录的 `<编号>_Outline_Notes.md` 进度摘要。
- 任务会话的交接文件命名为 `<任务编号>_<唯一会话ID>_Handover_Record.md`；同一文件只由创建它的会话修改。
- 模块和任务会话不得修改上级 Outline、模块合同、任务清单或测试脚本。发现需求变化时，停止实现并交回主会话重新 document。

跨会话不共享正在进行的 tracer bullet：新会话先读取本层 Outline 进度摘要，再读取上一会话 Handover，重新运行测试确认 RED/GREEN 状态，再继续下一个 bullet。进度摘要只保留“已完成、待完成、下次直接开始、当前哈希和阻塞”；详细历史留在 Handover 与事件日志。

## 出错后的反馈、排查和修复

主会话合并失败、验收失败，或用户测试/使用时发现错误，都进入同一条 Rework 流程：

1. 主会话记录 incident，保存复现命令、预期/实际结果、失败测试、commit 和用户反馈。
2. 主会话先复现，再根据失败测试、路径和 `owned_paths` 定位负责的模块或任务。
3. 实现错误回到 `code/minimal GREEN`；测试错误回到 `test/RED`；需求、接口或交付物变化回到 `document`。
4. 受影响任务的旧 `test=true` 和 GREEN 证据立即标记失效。
5. 主会话不覆盖旧合同，而是创建并 seal 新合同 revision，例如 `T-001-v2` 或 `M01-v2`。
6. 模块问题使用 `Module_Rework_Prompt.md` 生成提示词，让用户复制给对应模块会话；任务问题使用 `Task_Rework_Prompt.md` 直接发送给任务 agent。
7. 修复后重新运行任务、模块和项目测试，主会话重新合并；发布前重新取得发布确认。

如果问题无法复现、归属跨越多个模块，或用户反馈与现有需求冲突，先停止并回到主会话澄清，不直接修改代码。

## 工作目录结构

Skill 发布仓库只包含安装所需内容：

```text
app/
├─ .agents/skills/assembly-development/     # Codex Skill 和 references
├─ .claude/skills/assembly-development/     # Claude Code Skill 和 references
├─ .codex/agents/                            # 可选 worker/verifier 配置
├─ .codex/rules/                             # Codex 危险命令规则
├─ scripts/                                  # 安装器、合同、状态、任务、hooks、验证脚本
├─ templates/                                # 项目、模块、任务模板
├─ package.json                              # npx 入口和发布白名单
├─ README.md
└─ LICENSE
```

消费项目的控制目录通常是：

```text
project/
├─ Outline_Notes.md                          # 项目主会话独占维护
├─ M01_Module_Outline_Notes.md               # 可选，模块合同，只读
├─ M01_Outline_Notes.md                      # 可选，模块会话最新进度
├─ tasks/                                     # 任务清单、测试脚本和任务 Outline
│  ├─ 001_任务名称.md                        # 任务合同，只读
│  └─ 001_Outline_Notes.md                   # 任务会话最新进度
├─ run/                                       # 事件、报告、机器证据、状态投影
├─ contracts/                                 # 已 seal 的任务合同
├─ docs/                                      # 需求和方案文档
└─ app/                                       # 独立 Git 仓库，只放最终代码
```

## 注意事项与风险

- 需求、接口、边界或交付物变化必须回到 document；不要在实现阶段偷偷扩大范围。
- 测试必须先 RED；没有 RED 证据，不得把实现结果标记为完成。
- 子会话只能写合同 `owned_paths` 和自己的 Handover；主会话负责合并和发布。
- 不要把密钥、个人信息或未审查的第三方 Skill 放进合同、prompt、日志或提交。
- 禁止 `git init`、`git reset --hard`、`git clean -fd/-fdx`、强制推送和删除 `.git`；普通推送也要由主会话取得用户确认。
- Git worktree 只是隔离手段，不是权限边界；最终以路径检查、测试、哈希和主会话复核为准。
- hooks 可能未加载、未匹配或被平台配置绕过；看到冲突时停止并向主会话报告，不要猜测继续。
