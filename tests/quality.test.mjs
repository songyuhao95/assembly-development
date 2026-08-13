// tests/quality.test.mjs — 报告校验（独立验证闸门）+ 缺陷注入 fixture
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = mkdtempSync(path.join(os.tmpdir(), 'asm-quality-'));
const root = path.join(tmp, 'proj');
mkdirSync(root, { recursive: true });

function run(reportFile) {
  // 报告路径按 validate-report 语义从调用目录解析，故传绝对路径；--root 用于证据
  return spawnSync(process.execPath, [path.resolve('scripts/validate-report.mjs'), path.join(root, reportFile), '--root', root], { encoding: 'utf8' });
}

const good = {
  schemaVersion: 1, runId: 'run-q', taskId: 'T-001', contractId: 'c1',
  contractSha256: 'sha256:' + 'a'.repeat(64),
  status: 'pass',
  acResults: [
    { acId: 'AC-1', verdict: 'pass', evidencePath: 'evidence/ac1.log' },
  ],
  changedFiles: ['src/x.ts'],
  commandsRun: [{ command: 'npm test', exitCode: 0 }],
};

const defect = {
  schemaVersion: 1, runId: 'run-q', taskId: 'T-002', contractId: 'c2',
  contractSha256: 'sha256:' + 'b'.repeat(64),
  status: 'pass',
  acResults: [
    { acId: 'AC-1', verdict: 'pass', evidencePath: 'evidence/missing.log' },
  ],
  changedFiles: ['src/y.ts'],
  commandsRun: [{ command: 'npm test', exitCode: 1 }],
};

test('合法报告通过校验', () => {
  mkdirSync(path.join(root, 'evidence'), { recursive: true });
  writeFileSync(path.join(root, 'evidence', 'ac1.log'), 'PASS');
  writeFileSync(path.join(root, 'good.json'), JSON.stringify(good));
  const r = run('good.json');
  assert.equal(r.status, 0, r.stderr);
});

test('缺陷注入：证据缺失 + 命令失败 + 自报 pass → REWORK_REQUIRED', () => {
  writeFileSync(path.join(root, 'defect.json'), JSON.stringify(defect));
  const r = run('defect.json');
  assert.equal(r.status, 1);
  assert.ok(r.stderr.includes('REWORK_REQUIRED'));
});

test('伪造合同哈希被拒', () => {
  const bad = { ...good, contractSha256: 'sha256:not-a-hash' };
  writeFileSync(path.join(root, 'bad.json'), JSON.stringify(bad));
  const r = run('bad.json');
  assert.equal(r.status, 1);
});

test.after(() => rmSync(tmp, { recursive: true, force: true }));
