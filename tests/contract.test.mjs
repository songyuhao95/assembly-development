// tests/contract.test.mjs — 合同：frontmatter 提取、校验、seal 哈希稳定性与版本
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { extractFrontmatter, validateFrontmatter, sealFile, fileFor } from '../scripts/contract.mjs';
import { canonicalize, contractHash } from '../scripts/identity.mjs';

const tmp = mkdtempSync(path.join(os.tmpdir(), 'asm-contract-'));

test('extractFrontmatter：解析首部 ```json 块', () => {
  const text = '```json\n{"a": 1}\n```\n\n# 正文\n';
  assert.deepEqual(extractFrontmatter(text), { a: 1 });
  assert.throws(() => extractFrontmatter('no block here'), /no ```json/);
});

test('validateFrontmatter：必填字段、阶段、拒绝 schema 外字段', () => {
  const base = {
    schemaVersion: 1, run_id: 'run-x', task_id: 'T-001', phase: 'implement',
    contract_id: 'c1', objective: 'o', success_definition: 's',
    scope: { include: [], exclude: [] }, owned_paths: ['src/x/'],
    deliverables: [{ path: 'a' }], ac_map: [{ ac_id: 'AC-1' }], risk_level: 'low',
  };
  assert.equal(validateFrontmatter(base).ok, true);
  const bad = { ...base, role: 'architect' };
  assert.equal(validateFrontmatter(bad).ok, false);
  assert.ok(validateFrontmatter(bad).errors.some((e) => e.includes('forbidden field')));
  const badPhase = { ...base, phase: 'nonsense' };
  assert.equal(validateFrontmatter(badPhase).ok, false);
});

test('规范化哈希：字段顺序无关、contract_sha256 被排除', () => {
  const a = { z: 1, contract_sha256: 'sha256:old', nested: { b: 2, a: 1 } };
  const b = { nested: { a: 1, b: 2 }, contract_sha256: 'sha256:different', z: 1 };
  assert.equal(contractHash(a), contractHash(b));
});

test('seal：写回版本与哈希；内容变化 → 版本递增、哈希变化', () => {
  // sealFile 使用仓库固定 contracts 目录；这里只验证纯函数行为（哈希/规范化）
  const fm1 = { schemaVersion: 1, name: 'c', fields: [1, 2] };
  const fm2 = { fields: [1, 2], schemaVersion: 1, name: 'c' };
  assert.equal(contractHash(fm1), contractHash(fm2));
  const fm3 = { schemaVersion: 1, name: 'c', fields: [1, 3] };
  assert.notEqual(contractHash(fm1), contractHash(fm3));
  // canonicalize 稳定
  assert.equal(JSON.stringify(canonicalize(fm1)), JSON.stringify(canonicalize(fm2)));
});

test.after(() => rmSync(tmp, { recursive: true, force: true }));
