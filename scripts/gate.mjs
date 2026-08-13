// scripts/gate.mjs — 人工门禁 G0–G5：checklist 查询与批准记录
//
// 用法：
//   node scripts/gate.mjs check --gate G1 [--runId r]
//   node scripts/gate.mjs approve --gate G1 --artifact <path> --sha256 <hex> [--runId r]
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { appendEvent } from './lib/event-append.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EVENTS = path.join(ROOT, 'run', 'events.ndjson');
const RUNTIME = path.join(ROOT, 'run', '.runtime');
const PROJECTIONS = path.join(ROOT, 'run', 'projections');

function fail(msg) {
  console.error(`gate.mjs: ${msg}`);
  process.exit(2);
}

// 与 references/gates.md 保持一致
const CHECKLISTS = {
  G0: [
    'Git 可用（或明确接受无 Git 串行降级）',
    '语言/包管理器/运行时版本',
    '中间件（数据库/缓存/队列/对象存储）版本与可达性',
    '本地/测试/预发布/生产环境边界',
    '远程服务器或云项目精确目标',
    '凭据存在且权限满足（不读取/打印/写入）',
    '外部 API 授权、预算、配额、限流',
    'CI/CD、构建与测试能力',
    '备份、恢复、日志、监控、告警条件',
    '预算/配额（云、API、人力）',
  ],
  G1: [
    '产品简档/需求、范围与非目标',
    'AC（验收标准）',
    'NFR（性能/容量/可用性/隐私/兼容性/成本）',
    '默认假设清单及其影响',
    '风险初筛',
  ],
  G2: [
    '技术选型与理由',
    '任务 DAG 已冻结（run/tasks/<RUN_ID>.json）',
    'API/schema 契约、数据与迁移方案',
    '外部计费服务与成本基线',
    '部署与回滚方案',
    '安全测试范围（授权目标）',
  ],
  G3: [
    '生产数据迁移方案（expand-contract/dry-run/备份/回滚）',
    '或明确记录 not_applicable',
  ],
  G4: [
    '精确生产环境与版本（commit/tag）',
    '时间窗与发布方法（灰度/蓝绿/canary）',
    '自动中止阈值与回滚条件',
    '观察期与告警',
  ],
  G5: [
    '交付物清单与哈希',
    '已知限制与风险接受',
    '最终验收（用户明确批准）',
  ],
};

function activeRunId() {
  const active = path.join(RUNTIME, 'active-run.json');
  if (existsSync(active)) {
    try {
      return JSON.parse(readFileSync(active, 'utf8')).runId;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function approvalsFor(runId, gate) {
  const p = path.join(PROJECTIONS, runId, 'approvals.json');
  if (!existsSync(p)) return [];
  try {
    return JSON.parse(readFileSync(p, 'utf8')).filter((a) => a.gate === gate);
  } catch {
    return [];
  }
}

function cmdCheck(gate, runId) {
  if (!CHECKLISTS[gate]) fail(`unknown gate: ${gate} (G0-G5)`);
  const items = CHECKLISTS[gate];
  const run = runId || activeRunId();
  const approvals = run ? approvalsFor(run, gate) : [];
  const latest = approvals[approvals.length - 1] || null;
  console.log(`gate ${gate}: ${latest ? 'APPROVED' : 'NOT_APPROVED'}`);
  if (latest) {
    console.log(`  artifact: ${latest.artifact}  sha256: ${latest.sha256}`);
    console.log(`  approvedAt: ${latest.approvedAt}  by: ${latest.by}`);
  }
  for (const item of items) {
    console.log(`  [ ] ${item}`);
  }
  if (!run) console.log('  (no active run; approvals checked against nothing)');
}

function cmdApprove(gate, args) {
  if (!CHECKLISTS[gate]) fail(`unknown gate: ${gate} (G0-G5)`);
  const idxA = args.indexOf('--artifact');
  const idxS = args.indexOf('--sha256');
  if (idxA < 0 || idxS < 0) fail('--artifact <path> and --sha256 <hex> required');
  const artifact = args[idxA + 1];
  const sha256 = args[idxS + 1];
  const run = args.includes('--runId') ? args[args.indexOf('--runId') + 1] : activeRunId();
  if (!run) fail('no active run; pass --runId');
  // 幂等：相同 gate+artifact+sha256 已批准则不再追加
  const existing = approvalsFor(run, gate);
  if (existing.some((a) => a.artifact === artifact && a.sha256 === sha256)) {
    console.log(`gate ${gate} already approved for ${artifact}@${sha256} (idempotent no-op)`);
    return;
  }
  appendEvent(EVENTS, {
    schemaVersion: 1,
    eventId: `evt-${Date.now()}-${Math.floor(Math.random() * 1e9)}`,
    at: new Date().toISOString(),
    type: 'gate.approved',
    runId: run,
    phase: null,
    taskId: null,
    contractId: null,
    agentId: null,
    actor: 'human',
    payload: { gate, artifact, sha256, by: 'human' },
  });
  console.log(`gate ${gate} approved: ${artifact}@${sha256}`);
}

const [cmd, ...args] = process.argv.slice(2);
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const gateIdx = args.indexOf('--gate');
  const gate = gateIdx >= 0 ? args[gateIdx + 1] : null;
  if (!gate) fail('--gate G0..G5 required');
  if (cmd === 'check') cmdCheck(gate, args.includes('--runId') ? args[args.indexOf('--runId') + 1] : null);
  else if (cmd === 'approve') cmdApprove(gate, args);
  else {
    console.error('usage: gate.mjs check|approve --gate <G0..G5> [--artifact p --sha256 h] [--runId r]');
    process.exit(2);
  }
}
