# 身份标识与规范化哈希

## ID 生成规则

- `RUN_ID`：`run-YYYYMMDD-NNN`（当天序号，由 run 启动脚本分配并写入 `run/.runtime/active-run.json`）。
- `TASK_ID`：`T-<NNN>`（plan 冻结时分配，全局唯一）。
- `CONTRACT_ID`：`contract-<TASK_ID>-v<N>`（与合同版本对应）。
- `eventId`：`evt-<ms>-<随机9位>`（仅用于唯一性；幂等靠 (type, entity, payload) 去重）。

## 规范化 sha256

`contract.mjs` 计算规则：
1. 抽取 JSON frontmatter；
2. 删除 `contract_sha256` 字段；
3. 递归排序所有对象键；
4. `JSON.stringify`（无空格、UTF-8）；
5. SHA-256 → `sha256:<hex>`。

同一内容不同字段顺序 → 同一哈希。任何实质修改 → 新哈希 + contract_version +1 → 旧批准失效。

## 派发信封（注入 subagent prompt）

```
[CONTRACT]
run_id=<RUN_ID>
task_id=<TASK_ID>
phase=<PHASE>
contract_id=<CONTRACT_ID>
contract_version=<v>
contract_sha256=sha256:<hex>
[END CONTRACT]
```

权威值以磁盘合同与事件为准；不信任模型自报字段。
