// tests/installer.test.mjs — 安装器 v2：用户级全功能（运行时 + 模板化 skill + 配置合并）
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = mkdtempSync(path.join(os.tmpdir(), 'asm-installer2-'));
const fakeHome = path.join(tmp, 'home');
const RUNTIME_POSIX = path.join(fakeHome, '.assembly-development').replaceAll('\\', '/');

function run(args = []) {
  return spawnSync(process.execPath, [path.resolve('scripts/install-cli.mjs'), '--quiet', ...args], {
    encoding: 'utf8',
    env: { ...process.env, ASM_HOME: fakeHome },
  });
}

test('运行时安装到 ~/.assembly-development（scripts + dashboard）', () => {
  const r = run([]);
  assert.equal(r.status, 0, r.stderr);
  for (const f of ['scripts/state.mjs', 'scripts/contract.mjs', 'scripts/hooks/hook-pretool.mjs', 'scripts/lib/project-root.mjs', 'dashboard/server.mjs', 'dashboard/index.html']) {
    assert.ok(existsSync(path.join(fakeHome, '.assembly-development', f)), `缺少 ${f}`);
  }
});

test('skill 副本已模板化：含命令的 md 指向运行时绝对路径，其余文件原样', () => {
  const repoRoot = path.resolve('.');
  for (const [skillDir, repoSkillDir] of [
    ['.claude/skills/assembly-development', '.claude/skills/assembly-development'],
    ['.agents/skills/assembly-development', '.agents/skills/assembly-development'],
  ]) {
    const files = ['SKILL.md', 'references/gates.md', 'references/phases.md', 'references/third-party-skills.md'];
    for (const f of files) {
      const src = readFileSync(path.join(repoRoot, repoSkillDir, f), 'utf8');
      const installed = readFileSync(path.join(fakeHome, skillDir, f), 'utf8');
      if (src.includes('node scripts/')) {
        assert.ok(!installed.includes('node scripts/'), `${skillDir}/${f} 仍含仓库内路径`);
        assert.ok(installed.includes(RUNTIME_POSIX), `${skillDir}/${f} 未模板化运行时路径`);
      } else {
        assert.equal(installed, src, `${skillDir}/${f} 应原样复制`);
      }
    }
  }
});

test('Claude 用户级 settings：hooks 指向运行时绝对路径 + deny 合并', () => {
  const settings = JSON.parse(readFileSync(path.join(fakeHome, '.claude', 'settings.json'), 'utf8'));
  assert.ok(settings.hooks.PreToolUse);
  assert.ok(settings.hooks.SubagentStop);
  const pretoolArgs = JSON.stringify(settings.hooks.PreToolUse[0].hooks[0].args);
  assert.ok(pretoolArgs.includes(RUNTIME_POSIX), 'hook args 必须指向运行时绝对路径');
  assert.ok(settings.permissions.deny.includes('Bash(git init:*)'));
  assert.ok(settings.permissions.allow.some((e) => e.includes(RUNTIME_POSIX)));
});

test('Codex 用户级：hooks.json/rules/AGENTS.md 块安装且指向运行时', () => {
  const hooks = JSON.parse(readFileSync(path.join(fakeHome, '.codex', 'hooks.json'), 'utf8'));
  assert.ok(hooks.hooks.PreToolUse && hooks.hooks.SubagentStop && hooks.hooks.Stop);
  assert.ok(JSON.stringify(hooks).includes(RUNTIME_POSIX));
  const rules = readFileSync(path.join(fakeHome, '.codex', 'rules', 'assembly-development.rules'), 'utf8');
  assert.ok(rules.includes('decision = "forbidden"'));
  const agentsMd = readFileSync(path.join(fakeHome, '.codex', 'AGENTS.md'), 'utf8');
  assert.ok(agentsMd.includes('## assembly-development 流水线（由安装器维护）'));
  assert.ok(agentsMd.includes(RUNTIME_POSIX));
});

test('幂等：重复安装不重复 hooks、不覆盖用户修改；--force 可更新', () => {
  const claudeSettings = path.join(fakeHome, '.claude', 'settings.json');
  const before = JSON.parse(readFileSync(claudeSettings, 'utf8'));
  run([]);
  const after = JSON.parse(readFileSync(claudeSettings, 'utf8'));
  assert.equal(after.hooks.PreToolUse.length, before.hooks.PreToolUse.length, 'hooks 不得重复合并');

  const skillFile = path.join(fakeHome, '.claude', 'skills', 'assembly-development', 'SKILL.md');
  writeFileSync(skillFile, '# 用户修改\n');
  run([]);
  assert.equal(readFileSync(skillFile, 'utf8'), '# 用户修改\n', '无 --force 不得覆盖用户修改');
  run(['--force']);
  assert.ok(readFileSync(skillFile, 'utf8').includes('assembly-development'), '--force 恢复运行时版本');
});

test('合并保留用户已有配置条目', () => {
  const settings = path.join(fakeHome, '.claude', 'settings.json');
  const target = JSON.parse(readFileSync(settings, 'utf8'));
  target.permissions.allow.push('Bash(my-custom-cmd:*)');
  writeFileSync(settings, JSON.stringify(target));
  run(['--force']);
  const merged = JSON.parse(readFileSync(settings, 'utf8'));
  assert.ok(merged.permissions.allow.includes('Bash(my-custom-cmd:*)'), '用户条目应保留');
});

test('安装后的运行时可在任意项目 cwd 下工作（脚本项目化）', () => {
  const proj = path.join(tmp, 'someproject');
  mkdirSync(proj, { recursive: true });
  const state = path.join(fakeHome, '.assembly-development', 'scripts', 'state.mjs');
  const r = spawnSync(process.execPath, [state, 'run-start', 'run-v2-test'], { encoding: 'utf8', cwd: proj });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(path.join(proj, 'run', 'events.ndjson')), '事件必须落在项目目录而非运行时目录');
  assert.ok(existsSync(path.join(proj, 'run', '.runtime', 'active-run.json')));
});

test.after(() => rmSync(tmp, { recursive: true, force: true }));
