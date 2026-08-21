import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function writeResult(resultPath, result) {
  mkdirSync(path.dirname(resultPath), { recursive: true });
  writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
}

function parseScalar(value) {
  const trimmed = value.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  return trimmed.replace(/^['"]|['"]$/g, '');
}

function parseFrontmatter(contents) {
  const lines = contents.replaceAll('\r\n', '\n').split('\n');
  if (lines[0] !== '---') throw new Error('missing-skill-frontmatter');
  const end = lines.indexOf('---', 1);
  if (end < 0) throw new Error('unterminated-skill-frontmatter');
  const frontmatter = {};
  let listKey = null;
  for (const line of lines.slice(1, end)) {
    const list = line.match(/^\s+-\s+(.+)$/);
    if (list && listKey) {
      frontmatter[listKey].push(parseScalar(list[1]));
      continue;
    }
    const pair = line.match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
    if (!pair) continue;
    const [, key, raw = ''] = pair;
    if (raw.trim() === '') {
      frontmatter[key] = [];
      listKey = key;
    } else {
      frontmatter[key] = parseScalar(raw);
      listKey = null;
    }
  }
  return frontmatter;
}

function validateSkillName(skill) {
  if (typeof skill !== 'string' || !/^[A-Za-z0-9._-]+$/.test(skill)) {
    throw new Error('invalid-skill-name');
  }
}

function findSkill(skill, skillRoots) {
  validateSkillName(skill);
  for (const root of skillRoots) {
    if (typeof root !== 'string' || !path.isAbsolute(root)) throw new Error('skill-root-not-absolute');
    const skillFile = path.join(root, skill, 'SKILL.md');
    if (!existsSync(skillFile)) continue;
    const realRoot = realpathSync(root);
    const realSkillFile = realpathSync(skillFile);
    const relative = path.relative(realRoot, realSkillFile);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error('skill-path-outside-root');
    }
    const frontmatter = parseFrontmatter(readFileSync(realSkillFile, 'utf8'));
    if (frontmatter.name !== skill) throw new Error('skill-name-mismatch');
    return {
      skill,
      path: realSkillFile,
      name: frontmatter.name,
      disableModelInvocation: frontmatter['disable-model-invocation'] === true,
      dependsOn: Array.isArray(frontmatter.depends_on) ? frontmatter.depends_on : [],
    };
  }
  return null;
}

export function inspectSkillRoutes(request) {
  const payload = request.payload || {};
  if (!['codex', 'claude'].includes(payload.client)) throw new Error('unsupported-client');
  if (!Array.isArray(payload.skillRoots) || !Array.isArray(payload.requestedRoutes)) {
    throw new Error('invalid-skill-inspection-request');
  }
  const closure = [];
  const skillByName = new Map();
  const missingFiles = [];
  const missingByName = new Map();
  const cycles = [];
  const states = new Map();
  const stack = [];

  function recordMissing(skill, required) {
    const existing = missingByName.get(skill);
    if (existing) {
      existing.required ||= required;
      return;
    }
    const missing = {
      skill,
      required,
      paths: payload.skillRoots.map((root) => path.join(root, skill, 'SKILL.md')),
    };
    missingByName.set(skill, missing);
    missingFiles.push(missing);
  }

  function visit(skillName, required) {
    validateSkillName(skillName);
    if (states.get(skillName) === 'visiting') {
      const cycleStart = stack.indexOf(skillName);
      const cycle = [...stack.slice(cycleStart), skillName];
      if (!cycles.some((entry) => JSON.stringify(entry) === JSON.stringify(cycle))) cycles.push(cycle);
      return;
    }
    if (states.get(skillName) === 'visited') return;
    const skill = findSkill(skillName, payload.skillRoots);
    if (!skill) {
      recordMissing(skillName, required);
      states.set(skillName, 'visited');
      return;
    }
    skillByName.set(skillName, skill);
    closure.push(skill);
    states.set(skillName, 'visiting');
    stack.push(skillName);
    for (const dependency of skill.dependsOn) visit(dependency, required);
    stack.pop();
    states.set(skillName, 'visited');
  }

  for (const requested of payload.requestedRoutes) visit(requested.skill, requested.required === true);

  const routes = payload.requestedRoutes.map((requested) => {
    const skill = skillByName.get(requested.skill);
    if (!skill) return {
      skill: requested.skill,
      trigger: requested.trigger,
      classification: 'unknown',
      action: 'block',
    };
    if (skill.disableModelInvocation) {
      return {
        skill: requested.skill,
        trigger: requested.trigger,
        classification: 'user-only',
        action: 'suggest',
      };
    }
    return {
      skill: requested.skill,
      trigger: requested.trigger,
      classification: requested.required ? 'required' : 'conditional',
      action: requested.required ? 'invoke' : 'suggest',
    };
  });
  const requiredMissing = missingFiles.some((missing) => missing.required);
  const hasCycles = cycles.length > 0;
  return {
    schemaVersion: 1,
    ok: !requiredMissing && !hasCycles,
    operation: request.operation,
    verdict: hasCycles ? 'denied' : requiredMissing ? 'blocked' : 'complete',
    client: payload.client,
    routes,
    closure,
    cycles,
    missingFiles,
    runtimeCapabilities: payload.capabilities || {},
    installAttempted: false,
    thirdPartyExecuted: false,
    errors: hasCycles
      ? ['skill-dependency-cycle']
      : requiredMissing ? ['required-skill-unavailable'] : [],
  };
}

function denied(operation, error) {
  return {
    schemaVersion: 1,
    ok: false,
    operation,
    verdict: 'denied',
    routes: [],
    closure: [],
    cycles: [],
    missingFiles: [],
    runtimeCapabilities: {},
    installAttempted: false,
    thirdPartyExecuted: false,
    errors: [error],
  };
}

function main() {
  const resultPath = argument('--result');
  let operation = null;
  try {
    if (process.argv[2] !== 'inspect') throw new Error('unsupported-verb');
    const requestPath = argument('--request');
    if (!requestPath || !resultPath) throw new Error('missing-request-or-result');
    const request = JSON.parse(readFileSync(requestPath, 'utf8'));
    operation = request.operation;
    if (operation !== 'skill.inspect') throw new Error('unsupported-operation');
    const result = inspectSkillRoutes(request);
    writeResult(resultPath, result);
    process.exit(result.verdict === 'blocked' ? 3 : result.verdict === 'denied' ? 2 : 0);
  } catch (error) {
    if (resultPath) writeResult(resultPath, denied(operation, error.message));
    process.exit(2);
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) main();
