#!/usr/bin/env node
// scripts/install-cli.mjs — assembly-development 一键安装器（v2：用户级全功能，无 --project）
//
// 安装内容（全部用户级，装一次任何项目可用）：
//   ~/.assembly-development/          运行时（scripts/ + dashboard/，供 skill 与 hooks 调用）
//   ~/.claude/skills/assembly-development/     Claude skill（命令已模板化为绝对路径）
//   ~/.agents/skills/assembly-development/     Codex skill（同上）
//   ~/.claude/settings.json                    hooks + permissions 合并（hooks 指向运行时绝对路径）
//   ~/.codex/hooks.json                        同上
//   ~/.codex/rules/assembly-development.rules  execpolicy 硬阻断规则
//   ~/.codex/AGENTS.md                         追加流水线说明块
//
// 用法：
//   npx github:songyuhao95/assembly-development
//   npx github:songyuhao95/assembly-development --claude | --codex
//   npx github:songyuhao95/assembly-development --force     # 覆盖已装文件
//
// 环境变量（测试用）：ASM_HOME 覆盖主目录。
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOME = process.env.ASM_HOME ? path.resolve(process.env.ASM_HOME) : os.homedir();
const RUNTIME = path.join(HOME, '.assembly-development');
const RUNTIME_POSIX = RUNTIME.replaceAll('\\', '/'); // 跨 shell（bash/powershell）可用的绝对路径

const args = process.argv.slice(2);
const FLAGS = {
  claude: args.includes('--claude'),
  codex: args.includes('--codex'),
  force: args.includes('--force'),
  quiet: args.includes('--quiet'),
};
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

// ---------- 文件工具 ----------

function copyTree(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const s = path.join(src, entry);
    const d = path.join(dest, entry);
    if (statSync(s).isDirectory()) copyTree(s, d);
    else if (!existsSync(d) || FLAGS.force) {
      mkdirSync(path.dirname(d), { recursive: true });
      cpSync(s, d);
    }
  }
}

// 模板化：仓库内命令 `node scripts/` → 运行时绝对路径（安装后任意项目可用）
function template(text) {
  return text.replaceAll('node scripts/', `node "${RUNTIME_POSIX}/scripts/`);
}

function copySkillTemplated(src, dest, label) {
  if (existsSync(path.join(dest, 'SKILL.md')) && !FLAGS.force) {
    record(label, false, `已存在（${dest}）；如需更新用 --force`);
    return;
  }
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const s = path.join(src, entry);
    const d = path.join(dest, entry);
    if (statSync(s).isDirectory()) copySkillTemplated(s, d, label);
    else if (entry.endsWith('.md')) {
      writeFileSync(d, template(readFileSync(s, 'utf8')), 'utf8');
    } else if (!existsSync(d) || FLAGS.force) {
      cpSync(s, d);
    }
  }
}

function readJson(p) {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return {};
  }
}

function mergeJson(targetPath, sourceObj) {
  const target = readJson(targetPath);
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

function appendBlock(targetPath, marker, block) {
  let text = existsSync(targetPath) ? readFileSync(targetPath, 'utf8') : '';
  if (text.includes(marker) && !FLAGS.force) return false;
  if (text.includes(marker) && FLAGS.force) {
    text = text.split(marker)[0];
  }
  if (text && !text.endsWith('\n')) text += '\n';
  writeFileSync(targetPath, text + block, 'utf8');
  return true;
}

// ---------- 运行时安装 ----------

function installRuntime() {
  copyTree(path.join(PKG_ROOT, 'scripts'), path.join(RUNTIME, 'scripts'));
  copyTree(path.join(PKG_ROOT, 'dashboard'), path.join(RUNTIME, 'dashboard'));
  // 语法自检：运行时脚本必须可解析
  let bad = 0;
  for (const dir of ['scripts', 'scripts/hooks', 'scripts/lib']) {
    for (const f of readdirSync(path.join(RUNTIME, dir))) {
      if (!f.endsWith('.mjs')) continue;
      try {
        execFileSync(process.execPath, ['--check', path.join(RUNTIME, dir, f)], { stdio: 'ignore' });
      } catch {
        bad++;
        record(`语法检查 ${dir}/${f}`, false);
      }
    }
  }
  record('运行时安装', bad === 0, `${RUNTIME_POSIX}（scripts + dashboard）`);
  return bad === 0;
}

// ---------- Claude ----------

function claudeHookConfig() {
  const hook = (name) => ({
    type: 'command',
    command: 'node',
    args: [`${RUNTIME_POSIX}/scripts/hooks/${name}`],
  });
  return {
    hooks: {
      SessionStart: [{ hooks: [hook('hook-session-start.mjs')] }],
      UserPromptSubmit: [{ hooks: [hook('hook-user-prompt.mjs')] }],
      PreToolUse: [{ matcher: 'Bash', hooks: [hook('hook-pretool.mjs')] }],
      PostToolUseFailure: [{ matcher: 'Bash', hooks: [hook('hook-tool-failure.mjs')] }],
      SubagentStop: [{ matcher: 'general-purpose', hooks: [hook('hook-subagent-stop.mjs')] }],
      Stop: [{ hooks: [hook('hook-stop.mjs')] }],
      StopFailure: [{ hooks: [hook('hook-stop-failure.mjs')] }],
    },
  };
}

function installClaude() {
  copySkillTemplated(
    path.join(PKG_ROOT, '.claude', 'skills', 'assembly-development'),
    path.join(HOME, '.claude', 'skills', 'assembly-development'),
    'Claude skill'
  );
  const settings = path.join(HOME, '.claude', 'settings.json');
  mergeJson(settings, {
    ...claudeHookConfig(),
    permissions: {
      allow: [
        `Bash(node "${RUNTIME_POSIX}/scripts/state.mjs:*)`,
        `Bash(node "${RUNTIME_POSIX}/scripts/identity.mjs:*)`,
        `Bash(node "${RUNTIME_POSIX}/scripts/contract.mjs:*)`,
        `Bash(node "${RUNTIME_POSIX}/scripts/tasks.mjs:*)`,
        `Bash(node "${RUNTIME_POSIX}/scripts/gate.mjs:*)`,
        `Bash(node "${RUNTIME_POSIX}/scripts/risks.mjs:*)`,
        `Bash(node "${RUNTIME_POSIX}/scripts/snapshot.mjs:*)`,
        `Bash(node "${RUNTIME_POSIX}/scripts/git-remote.mjs:*)`,
        `Bash(node "${RUNTIME_POSIX}/scripts/dashboard-start.mjs:*)`,
        `Bash(node "${RUNTIME_POSIX}/scripts/dashboard-stop.mjs:*)`,
        `Bash(node "${RUNTIME_POSIX}/scripts/self-test.mjs:*)`,
        `Bash(node "${RUNTIME_POSIX}/scripts/validate-report.mjs:*)`,
      ],
      deny: [
        'Bash(git init:*)', 'Bash(git init)',
        'Bash(git reset --hard:*)', 'Bash(git reset --hard)',
        'Bash(git clean -fd:*)', 'Bash(git clean -fd)',
        'Bash(git push --force:*)', 'Bash(git push --force)',
        'Bash(rm -rf .git*)', 'Bash(rm -rf:*)',
      ],
    },
  });
  record('Claude 用户级 hooks/permissions', true, settings);
}

// ---------- Codex ----------

function codexHookCommand(script, windows) {
  return windows
    ? `powershell -NoProfile -Command "& node '${RUNTIME_POSIX}/scripts/hooks/${script}'"`
    : `node "${RUNTIME_POSIX}/scripts/hooks/${script}"`;
}

function installCodex() {
  copySkillTemplated(
    path.join(PKG_ROOT, '.agents', 'skills', 'assembly-development'),
    path.join(HOME, '.agents', 'skills', 'assembly-development'),
    'Codex skill'
  );
  const rulesDest = path.join(HOME, '.codex', 'rules', 'assembly-development.rules');
  const rulesSrc = path.join(PKG_ROOT, '.codex', 'rules', 'assembly-development.rules');
  if (existsSync(rulesDest) && !FLAGS.force) {
    record('Codex 用户级 rules', false, `已存在（${rulesDest}）；如需更新用 --force`);
  } else {
    mkdirSync(path.dirname(rulesDest), { recursive: true });
    cpSync(rulesSrc, rulesDest);
    record('Codex 用户级 rules', true, rulesDest);
  }

  const hooks = {
    hooks: {
      SessionStart: [{ hooks: [{ type: 'command', command: codexHookCommand('hook-session-start.mjs'), commandWindows: codexHookCommand('hook-session-start.mjs', true), timeout: 15 }] }],
      UserPromptSubmit: [{ hooks: [{ type: 'command', command: codexHookCommand('hook-user-prompt.mjs'), commandWindows: codexHookCommand('hook-user-prompt.mjs', true), timeout: 15 }] }],
      PreToolUse: [{ matcher: '^Bash$', hooks: [{ type: 'command', command: codexHookCommand('hook-pretool.mjs'), commandWindows: codexHookCommand('hook-pretool.mjs', true), timeout: 15 }] }],
      PostToolUse: [{ matcher: '^Bash$', hooks: [{ type: 'command', command: codexHookCommand('hook-tool-failure.mjs'), commandWindows: codexHookCommand('hook-tool-failure.mjs', true), timeout: 15 }] }],
      SubagentStop: [{ hooks: [{ type: 'command', command: codexHookCommand('hook-subagent-stop.mjs'), commandWindows: codexHookCommand('hook-subagent-stop.mjs', true), timeout: 15 }] }],
      Stop: [{ hooks: [{ type: 'command', command: codexHookCommand('hook-stop.mjs'), commandWindows: codexHookCommand('hook-stop.mjs', true), timeout: 15 }] }],
    },
  };
  mergeJson(path.join(HOME, '.codex', 'hooks.json'), hooks);
  record('Codex 用户级 hooks', true, path.join(HOME, '.codex', 'hooks.json'));

  const agentBlock = `
## assembly-development 流水线（由安装器维护）

本机已安装 assembly-development 流水线。任何项目中开始开发前：
1. 调用 skill \`assembly-development\` 并按其协议执行（阶段机、任务合同、Gate G0-G5）。
2. 运行自检：\`node "${RUNTIME_POSIX}/scripts/self-test.mjs"\`；失败先修复。
3. 脚本统一位于 \`${RUNTIME_POSIX}/scripts\`（状态/合同/门禁/DAG/快照）；状态落在当前项目 run/ 目录。
4. 硬规则由 \`~/.codex/rules/assembly-development.rules\` 与 hooks 强制：禁止 git init / reset --hard / clean -fd / push --force / rm -rf .git；Gate 只认用户明确批准；冲突停止上报。
`;
  appendBlock(path.join(HOME, '.codex', 'AGENTS.md'), '## assembly-development 流水线（由安装器维护）', agentBlock);
  record('Codex 用户级 AGENTS.md 块', true);
}

// ---------- 主流程 ----------

log(`assembly-development 安装器 v${JSON.parse(readFileSync(path.join(PKG_ROOT, 'package.json'), 'utf8')).version}`);
log(`运行时: ${RUNTIME_POSIX}`);

installRuntime();
if (FLAGS.claude) installClaude();
if (FLAGS.codex) installCodex();

const failed = results.filter((r) => !r.ok);
log(`\n完成：${results.length - failed.length}/${results.length} 项成功`);
if (failed.length) log('失败/跳过项：' + failed.map((f) => f.name).join('、') + '（已存在未覆盖时加 --force 更新）');
log('\n用法（任何项目内）：');
log('  · Claude Code 或 Codex 会话中调用 assembly-development skill 即获得完整功能');
log('  · 首次在 Codex 使用：接受项目信任 + /hooks 审查批准一次');
log('  · 自检：node "' + RUNTIME_POSIX + '/scripts/self-test.mjs"');
process.exit(0);
