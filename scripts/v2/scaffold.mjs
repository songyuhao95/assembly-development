import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectSessionId, ownershipMeta, sha256Text } from '../lib/v2-ownership.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..', '..');

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function writeResult(resultPath, value) {
  mkdirSync(path.dirname(resultPath), { recursive: true });
  writeFileSync(resultPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function render(template, values) {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{{${key}}}`, String(value)),
    template,
  );
}

function bootstrap(request) {
  const sessionId = projectSessionId(request.actor?.sessionId);
  const ownership = ownershipMeta(sessionId, request.actor?.ownershipEpoch || 1);
  const outlinePath = path.join(request.workspaceRoot, 'Outline_Notes.md');
  const template = readFileSync(path.join(ROOT, 'templates', 'v2', 'project', 'Outline_Notes.md'), 'utf8');
  const content = render(template, {
    PROJECT_MAIN_SESSION_ID: sessionId,
    OWNERSHIP_EPOCH: ownership.ownershipEpoch,
    OUTLINE_REVISION: request.payload.outlineRevision,
    OUTLINE_SHA256: request.payload.outlineSha256,
    PROJECT_NAME: request.payload.projectName,
  });
  writeFileSync(outlinePath, content, 'utf8');
  return {
    schemaVersion: 1,
    ok: true,
    operation: request.operation,
    verdict: 'accepted',
    projectMainSessionId: sessionId,
    ...ownership,
    manifest: [{ path: 'Outline_Notes.md' }],
    errors: [],
  };
}

function workspacePath(workspaceRoot, relativePath) {
  const root = path.resolve(workspaceRoot);
  const resolved = path.resolve(root, relativePath);
  const prefix = `${root}${path.sep}`;
  if (resolved !== root && !resolved.startsWith(prefix)) throw new Error('path-outside-workspace');
  return resolved;
}

function modulePrepare(request) {
  const module = request.payload.module;
  if (!module?.id || !module.name || !module.workdir || !module.deliveryDir) {
    throw new Error('invalid-module-request');
  }
  const sessionId = projectSessionId(request.actor?.sessionId);
  const ownership = ownershipMeta(sessionId, request.actor?.ownershipEpoch || 1);
  const workdir = workspacePath(request.workspaceRoot, module.workdir);
  const deliveryDir = workspacePath(request.workspaceRoot, module.deliveryDir);
  const moduleRoot = path.dirname(workdir);
  mkdirSync(workdir, { recursive: true });
  mkdirSync(deliveryDir, { recursive: true });

  const contractPath = path.join(moduleRoot, `${module.id}_Module_Outline_Notes.md`);
  const contractTemplate = readFileSync(path.join(ROOT, 'templates', 'v2', 'module', 'Module_Outline_Notes.md'), 'utf8');
  const contract = render(contractTemplate, {
    MODULE_ID: module.id,
    MODULE_NAME: module.name,
    PROJECT_MAIN_SESSION_ID: sessionId,
    OWNERSHIP_EPOCH: ownership.ownershipEpoch,
    OUTLINE_REVISION: request.payload.outlineRevision,
    OUTLINE_SHA256: request.payload.outlineSha256,
    WORKDIR: module.workdir,
    DELIVERY_DIR: module.deliveryDir,
    OWNED_PATHS: (module.ownedPaths || []).map((entry) => `- ${entry}`).join('\n'),
    FORBIDDEN_PATHS: (module.forbiddenPaths || []).map((entry) => `- ${entry}`).join('\n'),
  });
  writeFileSync(contractPath, contract, 'utf8');
  const contractSha256 = sha256Text(contract);

  const promptPath = path.join(moduleRoot, `${module.id}_session_prompt.md`);
  const promptTemplate = readFileSync(path.join(ROOT, 'templates', 'v2', 'module', 'Module_Session_Prompt.md'), 'utf8');
  const prompt = render(promptTemplate, {
    MODULE_ID: module.id,
    MODULE_NAME: module.name,
    PROJECT_MAIN_SESSION_ID: sessionId,
    CONTRACT_PATH: contractPath,
    CONTRACT_SHA256: contractSha256,
    WORKDIR: workdir,
    DELIVERY_DIR: deliveryDir,
  });
  writeFileSync(promptPath, prompt, 'utf8');

  return {
    schemaVersion: 1,
    ok: true,
    operation: request.operation,
    verdict: 'accepted',
    projectMainSessionId: sessionId,
    ...ownership,
    contractPath,
    contractSha256,
    promptPath,
    manifest: [
      { path: path.relative(request.workspaceRoot, contractPath).replaceAll('\\', '/') },
      { path: path.relative(request.workspaceRoot, promptPath).replaceAll('\\', '/') },
    ],
    errors: [],
  };
}

function ownershipTransfer(request) {
  const payload = request.payload || {};
  const currentEpoch = Number(payload.currentOwnershipEpoch);
  const isCurrentOwner = request.actor?.sessionId === payload.currentOwnerSessionId;
  const isCurrentEpoch = Number(request.actor?.ownershipEpoch) === currentEpoch;
  if (!isCurrentOwner || !isCurrentEpoch) {
    return {
      schemaVersion: 1,
      ok: false,
      operation: request.operation,
      verdict: 'denied',
      reason: 'stale-owner-epoch',
      errors: ['stale-owner-epoch'],
    };
  }
  if (!payload.requestedOwnerSessionId) throw new Error('missing-requested-owner');
  return {
    schemaVersion: 1,
    ok: true,
    operation: request.operation,
    verdict: 'accepted',
    ownerSessionId: payload.requestedOwnerSessionId,
    ownershipEpoch: currentEpoch + 1,
    errors: [],
  };
}

function main() {
  const resultPath = argument('--result');
  try {
    if (process.argv[2] !== 'execute') throw new Error('unsupported-verb');
    const requestPath = argument('--request');
    if (!requestPath || !resultPath) throw new Error('missing-request-or-result');
    const request = JSON.parse(readFileSync(requestPath, 'utf8'));
    const operations = {
      'project.bootstrap': bootstrap,
      'module.prepare': modulePrepare,
      'ownership.transfer': ownershipTransfer,
    };
    const operation = operations[request.operation];
    if (!operation) throw new Error('unsupported-operation');
    const result = operation(request);
    writeResult(resultPath, result);
    process.exit(result.ok ? 0 : 2);
  } catch (error) {
    if (resultPath) {
      writeResult(resultPath, {
        schemaVersion: 1,
        ok: false,
        operation: null,
        verdict: 'denied',
        reason: error.message,
        errors: [error.message],
      });
    }
    process.exit(2);
  }
}

main();
