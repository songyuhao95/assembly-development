// scripts/contract.mjs — 合同注册表：扫描/校验/seal
//
// 用法：
//   node scripts/contract.mjs scan
//   node scripts/contract.mjs validate <contractId>
//   node scripts/contract.mjs seal <contractId>
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { canonicalize, contractHash } from './identity.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTRACTS_DIR = path.join(ROOT, 'contracts');

const ALLOWED_PHASES = ['clarify', 'plan', 'implement', 'integrate', 'verify', 'release'];
const REQUIRED_FIELDS = [
  'schemaVersion', 'run_id', 'task_id', 'phase', 'contract_id',
  'objective', 'success_definition', 'scope', 'owned_paths',
  'deliverables', 'ac_map', 'risk_level',
];
// ADR-005：无 persona/ROLE 的合同驱动——这些字段禁止出现
const FORBIDDEN_FIELDS = ['role', 'role_id', 'persona', 'agent_role'];

function fail(msg) {
  console.error(`contract.mjs: ${msg}`);
  process.exit(2);
}

export function extractFrontmatter(text) {
  const m = text.match(/^```json\s*\n([\s\S]*?)\n```/);
  if (!m) throw new Error('no ```json frontmatter block at file start');
  return JSON.parse(m[1]);
}

export function validateFrontmatter(fm) {
  const errors = [];
  for (const f of REQUIRED_FIELDS) {
    if (fm[f] === undefined || fm[f] === null) errors.push(`missing required field: ${f}`);
  }
  if (fm.schemaVersion !== 1) errors.push(`schemaVersion must be 1, got ${fm.schemaVersion}`);
  if (!ALLOWED_PHASES.includes(fm.phase)) errors.push(`phase must be one of ${ALLOWED_PHASES.join(',')}`);
  if (!Array.isArray(fm.owned_paths) || fm.owned_paths.length === 0) errors.push('owned_paths must be a non-empty array');
  if (!Array.isArray(fm.deliverables) || fm.deliverables.length === 0) errors.push('deliverables must be a non-empty array');
  if (!Array.isArray(fm.ac_map) || fm.ac_map.length === 0) errors.push('ac_map must be a non-empty array');
  if (fm.contract_version !== undefined && !Number.isInteger(fm.contract_version)) errors.push('contract_version must be an integer');
  for (const f of FORBIDDEN_FIELDS) {
    if (fm[f] !== undefined) errors.push(`forbidden field (no-persona policy): ${f}`);
  }
  return { ok: errors.length === 0, errors };
}

export function fileFor(contractId) {
  return path.join(CONTRACTS_DIR, `${contractId}.md`);
}

export function readContract(contractId) {
  const f = fileFor(contractId);
  if (!existsSync(f)) throw new Error(`contract file not found: ${f}`);
  return { file: f, text: readFileSync(f, 'utf8') };
}

export function sealFile(contractId) {
  const { file, text } = readContract(contractId);
  const fm = extractFrontmatter(text);
  const storedHash = fm.contract_sha256;
  const newHash = contractHash(fm); // 内部已排除 contract_sha256 字段
  let changed = false;
  if (!storedHash || storedHash !== newHash) {
    changed = true;
    fm.contract_version = Number.isInteger(fm.contract_version) ? fm.contract_version + 1 : 1;
    fm.contract_sha256 = newHash;
    const canonical = JSON.stringify(canonicalize(fm), null, 2);
    const body = text.replace(/^```json\s*\n[\s\S]*?\n```/, (block) => block);
    // 重写 frontmatter 块
    const idx = text.indexOf('```json');
    const end = text.indexOf('\n```', idx);
    const rebuilt = '```json\n' + canonical + '\n```' + text.slice(end);
    writeFileSync(file, rebuilt, 'utf8');
  }
  const verdict = validateFrontmatter(fm);
  if (!verdict.ok) {
    console.error(verdict.errors.join('\n'));
    process.exit(2);
  }
  return { contractId, contract_id: fm.contract_id, version: fm.contract_version, sha256: newHash, changed };
}

function scan() {
  if (!existsSync(CONTRACTS_DIR)) return [];
  return readdirSync(CONTRACTS_DIR)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
    .map((f) => f.slice(0, -3));
}

const [cmd, ...args] = process.argv.slice(2);
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  switch (cmd) {
    case 'scan': {
      const list = scan();
      console.log(list.length ? list.join('\n') : '(no contracts)');
      break;
    }
    case 'validate': {
      const id = args[0];
      if (!id) fail('usage: contract.mjs validate <contractId>');
      try {
        const { file, text } = readContract(id);
        const fm = extractFrontmatter(text);
        const verdict = validateFrontmatter(fm);
        if (!verdict.ok) {
          console.error(verdict.errors.join('\n'));
          process.exit(1);
        }
        const expected = contractHash(fm);
        if (fm.contract_sha256 !== expected) {
          console.error(`hash mismatch: stored=${fm.contract_sha256} computed=${expected} (run seal)`);
          process.exit(1);
        }
        console.log(`ok: ${id} v${fm.contract_version} ${fm.contract_sha256}`);
      } catch (err) {
        fail(err.message);
      }
      break;
    }
    case 'seal': {
      const id = args[0];
      if (!id) fail('usage: contract.mjs seal <contractId>');
      try {
        const r = sealFile(id);
        console.log(`sealed: ${id} v${r.version} ${r.sha256}${r.changed ? ' (updated)' : ' (unchanged)'}`);
      } catch (err) {
        fail(err.message);
      }
      break;
    }
    default:
      console.error('usage: contract.mjs scan | validate <id> | seal <id>');
      process.exit(2);
  }
}
