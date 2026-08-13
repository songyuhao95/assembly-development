// tests/installer.test.mjs — npx 安装器：用户级复制、项目级合并、幂等与 --force
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = mkdtempSync(path.join(os.tmpdir(), 'asm-installer-'));
const fakeHome = path.join(tmp, 'home');
const proj = path.join(tmp, 'proj');

function run(args, env = {}) {
  return spawnSync(process.execPath, [path.resolve('scripts/install-cli.mjs'), '--quiet', ...args], {
    encoding: 'utf8',
    env: { ...process.env, ASM_HOME: fakeHome, ...env },
  });
}

test('用户级：Claude skill + Codex skill/rules 安装到位', () => {
  const r = run([]);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(path.join(fakeHome, '.claude', 'skills', 'assembly-development', 'SKILL.md')));
  assert.ok(existsSync(path.join(fakeHome, '.agents', 'skills', 'assembly-development', 'SKILL.md')));
  const rules = readFileSync(path.join(fakeHome, '.codex', 'rules', 'assembly-development.rules'), 'utf8');
  assert.ok(rules.includes('decision = "forbidden"'));
});

test('幂等：重复安装不覆盖用户对已装文件的修改（非破坏性）', () => {
  const skill = path.join(fakeHome, '.claude', 'skills', 'assembly-development', 'SKILL.md');
  writeFileSync(skill, '# 用户修改\n');
  const r = run([]); // 无 --force
  assert.equal(r.status, 0);
  assert.equal(readFileSync(skill, 'utf8'), '# 用户修改\n', '无 --force 时不得覆盖用户修改');
});

test('--force 可更新', () => {
  const skill = path.join(fakeHome, '.claude', 'skills', 'assembly-development', 'SKILL.md');
  writeFileSync(skill, '# 用户修改\n');
  run(['--force', '--claude']);
  const text = readFileSync(skill, 'utf8');
  assert.ok(text.includes('assembly-development'), '--force 应恢复仓库版本');
});

test('项目级：skill/rules/agents/scripts/dashboard 落地，settings 与 hooks 合并保留用户条目', () => {
  mkdirSync(path.join(proj, '.claude'), { recursive: true });
  mkdirSync(path.join(proj, '.codex'), { recursive: true });
  writeFileSync(path.join(proj, '.claude', 'settings.json'), JSON.stringify({ permissions: { allow: ['Bash(git status:*)'] } }));
  writeFileSync(path.join(proj, '.codex', 'hooks.json'), JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo user-stop' }] }] } }));

  const r = run(['--project', '--project-dir', proj, '--claude', '--codex']);
  assert.equal(r.status, 0, r.stderr);

  assert.ok(existsSync(path.join(proj, '.agents', 'skills', 'assembly-development', 'SKILL.md')));
  assert.ok(existsSync(path.join(proj, '.claude', 'skills', 'assembly-development', 'SKILL.md')));
  assert.ok(existsSync(path.join(proj, '.codex', 'agents', 'asm-worker.toml')));
  assert.ok(existsSync(path.join(proj, '.codex', 'agents', 'asm-verifier.toml')));
  assert.ok(existsSync(path.join(proj, '.codex', 'rules', 'assembly-development.rules')));
  assert.ok(existsSync(path.join(proj, 'scripts', 'hooks', 'hook-pretool.mjs')));
  assert.ok(existsSync(path.join(proj, 'scripts', 'state.mjs')));
  assert.ok(existsSync(path.join(proj, 'dashboard', 'server.mjs')));
  assert.ok(existsSync(path.join(proj, 'AGENTS.md')));

  const settings = JSON.parse(readFileSync(path.join(proj, '.claude', 'settings.json'), 'utf8'));
  assert.ok(settings.permissions.allow.includes('Bash(git status:*)'), '用户条目应保留');
  assert.ok(settings.permissions.allow.some((e) => e.startsWith('Bash(node scripts/state.mjs')), '编排权限应合并');
  assert.ok(settings.hooks.PreToolUse, 'Claude hooks 应合并');

  const hooks = JSON.parse(readFileSync(path.join(proj, '.codex', 'hooks.json'), 'utf8'));
  assert.equal(hooks.hooks.Stop.length, 2, '用户 Stop handler + 我们的 Stop handler');
  assert.ok(hooks.hooks.SubagentStop, 'Codex hooks 应合并');
});

test('--force 项目级重复安装不产生重复 hooks 条目', () => {
  run(['--project', '--project-dir', proj, '--force']);
  const hooks = JSON.parse(readFileSync(path.join(proj, '.codex', 'hooks.json'), 'utf8'));
  assert.equal(hooks.hooks.Stop.length, 2, '合并应去重');
  const settings = JSON.parse(readFileSync(path.join(proj, '.claude', 'settings.json'), 'utf8'));
  const allowSet = new Set(settings.permissions.allow);
  assert.equal(allowSet.size, settings.permissions.allow.length, 'allow 应去重');
});

test.after(() => rmSync(tmp, { recursive: true, force: true }));
