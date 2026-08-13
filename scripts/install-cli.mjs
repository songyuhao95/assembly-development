#!/usr/bin/env node
// scripts/install-cli.mjs — assembly-development 一键安装器
//
// 用法（npx 从 GitHub 直装）：
//   npx github:songyuhao95/assembly-development                 # 用户级：Claude skill + Codex skill/rules
//   npx github:songyuhao95/assembly-development --claude        # 只装 Claude
//   npx github:songyuhao95/assembly-development --codex         # 只装 Codex
//   npx github:songyuhao95/assembly-development --project       # 当前项目完整落地（含 hooks/scripts）
//   npx github:songyuhao95/assembly-development --project-dir <dir> --force
//
// 环境变量（测试/CI 用）：ASM_HOME 覆盖用户主目录。
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOME = process.env.ASM_HOME ? path.resolve(process.env.ASM_HOME) : os.homedir();

const args = process.argv.slice(2);
const FLAGS = {
  claude: args.includes('--claude'),
  codex: args.includes('--codex'),
  project: args.includes('--project'),
  force: args.includes('--force'),
  quiet: args.includes('--quiet'),
};
const projectDirIdx = args.indexOf('--project-dir');
const PROJECT_DIR = projectDirIdx >= 0 ? path.resolve(args[projectDirIdx + 1]) : process.cwd();
// 未指定平台时默认双端；--project 时默认双端项目级
if (!FLAGS.claude && !FLAGS.codex) {
  FLAGS.claude = true;
  FLAGS.codex = true;
}

const log = (msg) => { if (!FLAGS.quiet) console.log(msg); };
const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  log(`${ok ? '✔' : '✘'} ${name}${detail ? ` — ${detail}` : ''}`);
}

function copyDir(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const s = path.join(src, entry);
    const d = path.join(dest, entry);
    if (statSync(s).isDirectory()) copyDir(s, d);
    else if (!existsSync(d) || FLAGS.force) {
      mkdirSync(path.dirname(d), { recursive: true });
      cpSync(s, d);
    }
  }
}

// 浅合并 JSON：hooks 事件数组按事件名拼接；permissions 数组拼接去重；其余键 target 缺失才写入
function mergeJson(targetPath, sourceObj) {
  let target = {};
  if (existsSync(targetPath)) {
    try {
      target = JSON.parse(readFileSync(targetPath, 'utf8'));
    } catch {
      record(`读取 ${targetPath}`, false, 'JSON 解析失败，跳过合并');
      return;
    }
  }
  for (const [key, value] of Object.entries(sourceObj)) {
    if (!(key in target)) {
      target[key] = value;
    } else if (key === 'hooks' && typeof value === 'object' && value) {
      target.hooks = target.hooks || {};
      for (const [event, handlers] of Object.entries(value)) {
        if (!target.hooks[event]) target.hooks[event] = handlers;
        else if (Array.isArray(target.hooks[event]) && Array.isArray(handlers)) {
          const existing = JSON.stringify(target.hooks[event]);
          for (const h of handlers) {
            if (!existing.includes(JSON.stringify(h))) target.hooks[event].push(h);
          }
        }
      }
    } else if (key === 'permissions' && typeof value === 'object' && value) {
      target.permissions = target.permissions || {};
      for (const [rule, entries] of Object.entries(value)) {
        if (!Array.isArray(entries)) continue;
        target.permissions[rule] = [...new Set([...(target.permissions[rule] || []), ...entries])];
      }
    }
  }
  mkdirSync(path.dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, JSON.stringify(target, null, 2) + '\n', 'utf8');
}

// ---------- 用户级安装 ----------

function installClaudeUser() {
  const dest = path.join(HOME, '.claude', 'skills', 'assembly-development');
  const src = path.join(PKG_ROOT, '.claude', 'skills', 'assembly-development');
  if (existsSync(dest) && !FLAGS.force) {
    record('Claude 用户级 skill', false, `已存在（${dest}）；如需更新用 --force`);
    return;
  }
  copyDir(src, dest);
  record('Claude 用户级 skill', true, dest);
}

function installCodexUser() {
  const skillDest = path.join(HOME, '.agents', 'skills', 'assembly-development');
  const skillSrc = path.join(PKG_ROOT, '.agents', 'skills', 'assembly-development');
  if (existsSync(skillDest) && !FLAGS.force) {
    record('Codex 用户级 skill', false, `已存在（${skillDest}）；如需更新用 --force`);
  } else {
    copyDir(skillSrc, skillDest);
    record('Codex 用户级 skill', true, skillDest);
  }
  const rulesDest = path.join(HOME, '.codex', 'rules', 'assembly-development.rules');
  const rulesSrc = path.join(PKG_ROOT, '.codex', 'rules', 'assembly-development.rules');
  if (existsSync(rulesDest) && !FLAGS.force) {
    record('Codex 用户级 rules', false, `已存在（${rulesDest}）；如需更新用 --force`);
  } else {
    mkdirSync(path.dirname(rulesDest), { recursive: true });
    cpSync(rulesSrc, rulesDest);
    record('Codex 用户级 rules', true, rulesDest);
  }
}

// ---------- 项目级安装 ----------

function installProject() {
  const proj = PROJECT_DIR;
  // Codex skill + rules + agents
  copyDir(path.join(PKG_ROOT, '.agents', 'skills', 'assembly-development'), path.join(proj, '.agents', 'skills', 'assembly-development'));
  record('项目 .agents/skills/assembly-development', true);
  mkdirSync(path.join(proj, '.codex', 'rules'), { recursive: true });
  if (!existsSync(path.join(proj, '.codex', 'rules', 'assembly-development.rules')) || FLAGS.force) {
    cpSync(path.join(PKG_ROOT, '.codex', 'rules', 'assembly-development.rules'), path.join(proj, '.codex', 'rules', 'assembly-development.rules'));
  }
  record('项目 .codex/rules', true);
  copyDir(path.join(PKG_ROOT, '.codex', 'agents'), path.join(proj, '.codex', 'agents'));
  record('项目 .codex/agents', true);
  // Claude skill
  copyDir(path.join(PKG_ROOT, '.claude', 'skills', 'assembly-development'), path.join(proj, '.claude', 'skills', 'assembly-development'));
  record('项目 .claude/skills/assembly-development', true);
  // 运行脚本与仪表盘（hooks 依赖）
  copyDir(path.join(PKG_ROOT, 'scripts'), path.join(proj, 'scripts'));
  record('项目 scripts/（含 hooks）', true);
  copyDir(path.join(PKG_ROOT, 'dashboard'), path.join(proj, 'dashboard'));
  record('项目 dashboard/', true);
  // AGENTS.md：缺失才复制
  if (!existsSync(path.join(proj, 'AGENTS.md'))) {
    cpSync(path.join(PKG_ROOT, 'AGENTS.md'), path.join(proj, 'AGENTS.md'));
    record('项目 AGENTS.md', true);
  } else {
    record('项目 AGENTS.md', false, '已存在，跳过（未覆盖）');
  }
  // hooks/permissions 合并
  const claudeSettings = path.join(proj, '.claude', 'settings.json');
  const srcSettings = JSON.parse(readFileSync(path.join(PKG_ROOT, '.claude', 'settings.json'), 'utf8'));
  mergeJson(claudeSettings, srcSettings);
  record('项目 .claude/settings.json（hooks/permissions 已合并）', true);
  const codexHooks = path.join(proj, '.codex', 'hooks.json');
  const srcHooks = JSON.parse(readFileSync(path.join(PKG_ROOT, '.codex', 'hooks.json'), 'utf8'));
  mergeJson(codexHooks, srcHooks);
  record('项目 .codex/hooks.json（已合并）', true);
}

// ---------- 主流程 ----------

log(`assembly-development 安装器 v${JSON.parse(readFileSync(path.join(PKG_ROOT, 'package.json'), 'utf8')).version}`);
log(`来源包: ${PKG_ROOT}`);

if (FLAGS.project) {
  if (FLAGS.claude) installClaudeUser();
  if (FLAGS.codex) installCodexUser();
  installProject();
} else {
  if (FLAGS.claude) installClaudeUser();
  if (FLAGS.codex) installCodexUser();
}

const failed = results.filter((r) => !r.ok);
log(`\n完成：${results.length - failed.length}/${results.length} 项成功`);
if (failed.length) {
  log('跳过项：' + failed.map((f) => f.name).join('、') + '（已存在，未覆盖；如需更新加 --force）');
}
log('\n后续步骤：');
log('  · Claude Code：新会话中即可使用 /assembly-development');
log('  · Codex：进入目标项目后接受项目信任；首次运行按提示 /hooks 审查批准一次');
log('  · 验证：node scripts/self-test.mjs（项目内）');
log('  · 规则自测：codex execpolicy check --rules .codex/rules/assembly-development.rules -- git status');
process.exit(failed.length && FLAGS.force ? 1 : 0);
