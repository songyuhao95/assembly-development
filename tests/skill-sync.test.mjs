// tests/skill-sync.test.mjs — 双平台适配一致性：Claude/.claude 与 Codex/.agents、.codex 配置
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('.');
const CLAUDE_REF = path.join(ROOT, '.claude/skills/assembly-development/references');
const AGENTS_REF = path.join(ROOT, '.agents/skills/assembly-development/references');

test('references 在 .claude 与 .agents 两份副本字节一致', () => {
  const files = readdirSync(CLAUDE_REF).filter((f) => f.endsWith('.md'));
  assert.ok(files.length >= 10, 'references 数量异常');
  for (const f of files) {
    const a = readFileSync(path.join(CLAUDE_REF, f), 'utf8');
    const b = readFileSync(path.join(AGENTS_REF, f), 'utf8');
    assert.equal(b, a, `references/${f} 两份副本不一致，需同步`);
  }
});

test('Codex SKILL.md frontmatter 仅含 name+description（Codex 规范）', () => {
  const text = readFileSync(path.join(AGENTS_REF, '..', 'SKILL.md'), 'utf8');
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(m, '缺少 frontmatter');
  const lines = m[1].split('\n').filter((l) => l.trim() && !l.startsWith('#'));
  for (const line of lines) {
    const key = line.split(':')[0].trim();
    assert.ok(['name', 'description'].includes(key), `Codex SKILL.md 出现非规范字段: ${key}`);
  }
});

test('Codex SKILL.md 包含核心协议标记', () => {
  const text = readFileSync(path.join(AGENTS_REF, '..', 'SKILL.md'), 'utf8');
  for (const marker of ['[CONTRACT]', 'contract.mjs seal', 'tasks.mjs freeze', 'gate.mjs check', 'state.mjs rebuild', 'snapshot.mjs publish', 'dashboard-start.mjs', 'G0', 'G5', 'asm-worker', 'asm-verifier']) {
    assert.ok(text.includes(marker), `Codex SKILL.md 缺少标记: ${marker}`);
  }
});

test('AGENTS.md 包含流程入口与硬规则', () => {
  const text = readFileSync(path.join(ROOT, 'AGENTS.md'), 'utf8');
  for (const marker of ['self-test.mjs', 'SKILL.md', '任务合同', 'G0–G5', 'git reset --hard', 'run/events.ndjson']) {
    assert.ok(text.includes(marker), `AGENTS.md 缺少标记: ${marker}`);
  }
});

test('.codex/hooks.json 合法且覆盖 6 个关键事件', () => {
  const hooks = JSON.parse(readFileSync(path.join(ROOT, '.codex/hooks.json'), 'utf8'));
  for (const ev of ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'SubagentStop', 'Stop']) {
    assert.ok(Array.isArray(hooks.hooks?.[ev]), `缺少事件: ${ev}`);
  }
  const pretool = hooks.hooks.PreToolUse[0];
  assert.equal(pretool.matcher, '^Bash$');
  assert.ok(pretool.hooks[0].command.includes('hook-pretool.mjs'));
  assert.ok(pretool.hooks[0].commandWindows, 'Windows 需要 commandWindows');
});

test('.codex/rules 包含 forbidden 硬阻断与 push prompt', () => {
  const rules = readFileSync(path.join(ROOT, '.codex/rules/assembly-development.rules'), 'utf8');
  for (const marker of ['["git", "init"]', '["git", "reset", "--hard"]', '["git", "push", ["--force", "-f"]]', 'decision = "forbidden"', 'decision = "prompt"', '["rm", "-rf", ".git"]']) {
    assert.ok(rules.includes(marker), `rules 缺少: ${marker}`);
  }
});

test('.codex/agents 两个代理具备必填字段与正确的沙箱划分', () => {
  const worker = readFileSync(path.join(ROOT, '.codex/agents/asm-worker.toml'), 'utf8');
  const verifier = readFileSync(path.join(ROOT, '.codex/agents/asm-verifier.toml'), 'utf8');
  for (const t of [worker, verifier]) {
    assert.ok(/^name = /m.test(t));
    assert.ok(/^description = /m.test(t));
    assert.ok(/^developer_instructions = /m.test(t));
  }
  assert.ok(worker.includes('workspace-write'));
  assert.ok(verifier.includes('read-only'));
  assert.ok(worker.includes('[CONTRACT]'));
  assert.ok(verifier.includes('PASS / FAIL / REWORK_REQUIRED'));
});
