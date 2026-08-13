#!/usr/bin/env node
// scripts/self-test.mjs — 会话启动自检（SKILL.md 第一步）
// 校验：hook 脚本、依赖 skill、状态目录可写、settings hooks 注册。
import { accessSync, existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ` — ${detail}` : ''}`);
}

// 1. hook 脚本
const HOOKS = [
  'hook-session-start', 'hook-user-prompt', 'hook-pretool', 'hook-tool-failure',
  'hook-subagent-stop', 'hook-stop', 'hook-stop-failure',
];
for (const h of HOOKS) {
  check(`hook/${h}.mjs`, existsSync(path.join(ROOT, 'scripts', 'hooks', `${h}.mjs`)));
}

// 2. settings hooks 注册
let settingsOk = false;
try {
  const settings = JSON.parse(readFileSync(path.join(ROOT, '.claude', 'settings.json'), 'utf8'));
  settingsOk = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUseFailure', 'SubagentStop', 'Stop', 'StopFailure']
    .every((e) => settings.hooks && settings.hooks[e]);
} catch {
  settingsOk = false;
}
check('.claude/settings.json hooks 注册', settingsOk);

// 3. 依赖 skill
const HOME_SKILLS = path.join(os.homedir(), '.claude', 'skills');
const REQUIRED = ['grill-me', 'web-design-guidelines', 'design-taste-frontend', 'ui-ux-pro-max'];
const OPTIONAL_CODE = ['code-simplification', 'refactor', 'code-review-excellence', 'tdd'];
for (const s of REQUIRED) {
  check(`依赖 skill: ${s}`, existsSync(path.join(HOME_SKILLS, s)));
}
const codeOrg = OPTIONAL_CODE.some((s) => existsSync(path.join(HOME_SKILLS, s)));
check(`代码整理类 skill（${OPTIONAL_CODE.join('/')} 任一）`, codeOrg, codeOrg ? '可用' : '缺失：安装前需用户批准（见 docs/dependencies.md）');

// 4. 状态目录可写
let writable = false;
try {
  const probe = path.join(ROOT, 'run', '.runtime', '.probe');
  mkdirSync(path.dirname(probe), { recursive: true });
  writeFileSync(probe, 'ok');
  readFileSync(probe, 'utf8');
  rmSync(probe, { force: true });
  writable = true;
} catch {
  writable = false;
}
check('run/ 状态目录可写', writable);

// 5. 核心脚本可解析
const SCRIPTS = ['identity', 'state', 'contract', 'tasks', 'gate', 'risks', 'snapshot', 'validate-report', 'dashboard-start', 'dashboard-stop', 'git-remote'];
for (const s of SCRIPTS) {
  check(`scripts/${s}.mjs`, existsSync(path.join(ROOT, 'scripts', `${s}.mjs`)));
}

// 6. Codex 适配层（.agents skill、.codex hooks/rules/agents、AGENTS.md）
check('Codex skill: .agents/skills/assembly-development/SKILL.md', existsSync(path.join(ROOT, '.agents', 'skills', 'assembly-development', 'SKILL.md')));
check('Codex hooks: .codex/hooks.json', existsSync(path.join(ROOT, '.codex', 'hooks.json')));
check('Codex rules: .codex/rules/assembly-development.rules', existsSync(path.join(ROOT, '.codex', 'rules', 'assembly-development.rules')));
check('Codex agents: asm-worker.toml', existsSync(path.join(ROOT, '.codex', 'agents', 'asm-worker.toml')));
check('Codex agents: asm-verifier.toml', existsSync(path.join(ROOT, '.codex', 'agents', 'asm-verifier.toml')));
check('AGENTS.md', existsSync(path.join(ROOT, 'AGENTS.md')));

const failed = results.filter((r) => !r.ok);
console.log(`\nself-test: ${results.length - failed.length}/${results.length} 项通过`);
if (failed.length) {
  console.error('缺失项：' + failed.map((f) => f.name).join('、'));
  process.exit(1);
}
process.exit(0);
