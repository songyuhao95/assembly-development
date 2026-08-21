#!/usr/bin/env node
// scripts/self-test.mjs — 会话启动自检（SKILL.md 第一步）
//
// 三个层面：
//  1. 运行时完整性（脚本自身所在目录：仓库内 = scripts/，安装后 = ~/.assembly-development/scripts/）
//  2. 平台强制配置（Claude 用户/项目 settings hooks；Codex 用户/项目 hooks.json、rules）
//  3. 当前项目（cwd）：状态目录可写、结构存在、依赖 skill 齐备
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { projectRoot } from './lib/project-root.mjs';
import { inspectSkillRoutes } from './v2/skill-router.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = projectRoot();
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ` — ${detail}` : ''}`);
}

// 1. 运行时完整性
const HOOKS = ['hook-session-start', 'hook-user-prompt', 'hook-pretool', 'hook-tool-failure', 'hook-subagent-stop', 'hook-stop', 'hook-stop-failure'];
for (const h of HOOKS) check(`运行时 hooks/${h}.mjs`, existsSync(path.join(HERE, 'hooks', `${h}.mjs`)));
const SCRIPTS = ['identity', 'state', 'contract', 'tasks', 'gate', 'risks', 'snapshot', 'validate-report', 'dashboard-start', 'dashboard-stop', 'git-remote', 'install-cli'];
for (const s of SCRIPTS) check(`运行时 scripts/${s}.mjs`, existsSync(path.join(HERE, `${s}.mjs`)));
check('运行时 scripts/v2/skill-router.mjs', existsSync(path.join(HERE, 'v2', 'skill-router.mjs')));
check('运行时 dashboard/server.mjs', existsSync(path.join(HERE, '..', 'dashboard', 'server.mjs')));

// 2. 平台强制配置（用户级或项目级任一存在即通过）
function hooksRegistered(settingsPath) {
  if (!existsSync(settingsPath)) return false;
  try {
    const s = JSON.parse(readFileSync(settingsPath, 'utf8'));
    return Boolean(s.hooks && s.hooks.PreToolUse && s.hooks.SubagentStop);
  } catch {
    return false;
  }
}
const userClaude = path.join(os.homedir(), '.claude', 'settings.json');
const projClaude = path.join(PROJECT, '.claude', 'settings.json');
check('Claude hooks 注册（用户级或项目级）', hooksRegistered(userClaude) || hooksRegistered(projClaude),
  hooksRegistered(projClaude) ? '项目级' : (hooksRegistered(userClaude) ? '用户级' : '均未注册'));

const userCodexHooks = path.join(os.homedir(), '.codex', 'hooks.json');
const projCodexHooks = path.join(PROJECT, '.codex', 'hooks.json');
check('Codex hooks 注册（用户级或项目级）', hooksRegistered(userCodexHooks) || hooksRegistered(projCodexHooks));

const userRules = path.join(os.homedir(), '.codex', 'rules', 'assembly-development.rules');
const projRules = path.join(PROJECT, '.codex', 'rules', 'assembly-development.rules');
check('Codex execpolicy rules（用户级或项目级）', existsSync(userRules) || existsSync(projRules));

// 3. 当前项目
let writable = false;
try {
  const probe = path.join(PROJECT, 'run', '.runtime', '.probe');
  mkdirSync(path.dirname(probe), { recursive: true });
  writeFileSync(probe, 'ok');
  readFileSync(probe, 'utf8');
  rmSync(probe, { force: true });
  writable = true;
} catch {
  writable = false;
}
check(`项目状态目录可写（${PROJECT}/run）`, writable);
check('项目 contracts/ 目录', existsSync(path.join(PROJECT, 'contracts')), existsSync(path.join(PROJECT, 'contracts')) ? '' : '缺失：按 SKILL.md 项目引导创建');

// 4. 当前客户端的核心 skill 闭包；不得用另一个客户端的安装代替
const HOME_SKILLS_CLAUDE = path.join(os.homedir(), '.claude', 'skills');
const HOME_SKILLS_CODEX = path.join(os.homedir(), '.agents', 'skills');
const clientSkillRoots = {
  claude: [HOME_SKILLS_CLAUDE, path.join(PROJECT, '.claude', 'skills')],
  codex: [HOME_SKILLS_CODEX, path.join(PROJECT, '.agents', 'skills')],
};
const clientArgIndex = process.argv.indexOf('--client');
const explicitClient = clientArgIndex >= 0 ? process.argv[clientArgIndex + 1] : null;
if (explicitClient && !Object.hasOwn(clientSkillRoots, explicitClient)) {
  check('当前客户端参数', false, `不支持：${explicitClient}`);
}
const detectedClient = explicitClient
  || (process.env.CODEX_SESSION_ID || process.env.CODEX_THREAD_ID ? 'codex' : null)
  || (process.env.CLAUDE_CODE || process.env.CLAUDE_SESSION_ID ? 'claude' : null);
const clientsToInspect = detectedClient
  ? [[detectedClient, clientSkillRoots[detectedClient]]]
  : Object.entries(clientSkillRoots);
const coreRoutes = ['writing-for-agents', 'tdd', 'codebase-design']
  .map((skill) => ({ skill, trigger: 'self-test', required: true }));
for (const [client, skillRoots] of clientsToInspect) {
  let inspection;
  try {
    inspection = inspectSkillRoutes({
      operation: 'skill.inspect',
      payload: {
        client,
        skillRoots,
        requestedRoutes: coreRoutes,
        capabilities: { network: false, backgroundAgent: false, git: true },
        allowInstall: false,
        allowExecuteThirdParty: false,
      },
    });
  } catch (error) {
    inspection = { ok: false, missingFiles: [], cycles: [], errors: [error.message] };
  }
  const detail = inspection.ok
    ? ''
    : JSON.stringify({
      missing: inspection.missingFiles.map((entry) => entry.skill),
      cycles: inspection.cycles,
      errors: inspection.errors,
    });
  check(`${client} 核心 skill 闭包`, inspection.ok, detail);
}

const failed = results.filter((r) => !r.ok);
console.log(`\nself-test: ${results.length - failed.length}/${results.length} 项通过`);
if (failed.length) {
  console.error('缺失项：' + failed.map((f) => f.name).join('、'));
  process.exit(1);
}
process.exit(0);
