// scripts/validate-report.mjs — 任务报告校验（独立验证路径的机械闸门）
//
// 用法：node scripts/validate-report.mjs <report.json> [--root <dir>]
// 校验：schema、AC 与证据一致性、必需命令退出码、合同哈希非空。
// 发现矛盾 → REWORK_REQUIRED（exit 1）；合法 → exit 0。
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

function fail(msg) {
  console.error(`validate-report.mjs: REWORK_REQUIRED — ${msg}`);
  process.exit(1);
}

const file = process.argv[2];
if (!file) {
  console.error('usage: validate-report.mjs <report.json> [--root <dir>]');
  process.exit(2);
}
const rootIdx = process.argv.indexOf('--root');
const root = rootIdx >= 0 ? process.argv[rootIdx + 1] : process.cwd();

let report;
try {
  report = JSON.parse(readFileSync(path.resolve(root, file), 'utf8'));
} catch (err) {
  fail(`cannot read report: ${err.message}`);
}

const REQUIRED = ['schemaVersion', 'runId', 'taskId', 'contractId', 'contractSha256', 'status', 'acResults', 'changedFiles', 'commandsRun'];
for (const f of REQUIRED) {
  if (report[f] === undefined || report[f] === null) fail(`missing field: ${f}`);
}
if (report.schemaVersion !== 1) fail(`schemaVersion must be 1`);
if (report.status !== 'pass' && report.status !== 'fail') fail(`status must be pass|fail`);
if (!/^sha256:[0-9a-f]{64}$/.test(report.contractSha256)) fail(`invalid contractSha256: ${report.contractSha256.slice(0, 20)}…`);

// AC 与证据一致：status=pass 要求所有 AC pass 且证据文件存在
const failing = [];
for (const ac of report.acResults || []) {
  if (ac.verdict !== 'pass') failing.push(`${ac.acId}: verdict=${ac.verdict}`);
  else if (ac.evidencePath && !existsSync(path.resolve(root, ac.evidencePath))) {
    failing.push(`${ac.acId}: evidence missing ${ac.evidencePath}`);
  }
}
if (report.status === 'pass' && failing.length) {
  fail(`status=pass but AC evidence incomplete: ${failing.join('; ')}`);
}

// 必需命令全部成功
for (const c of report.commandsRun || []) {
  if (c.exitCode !== 0) fail(`command failed (exit ${c.exitCode}): ${c.command.slice(0, 120)}`);
}
if (!report.commandsRun || report.commandsRun.length === 0) fail('commandsRun is empty — “已运行命令”不是证据，必须给出真实执行结果');

console.log(`ok: ${report.taskId} ${report.status} (${report.acResults.length} AC, ${report.commandsRun.length} commands)`);
process.exit(0);
