import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

function pathModule(platform) {
  return platform === 'win32' ? path.win32 : path.posix;
}

export function canonicalPath(inputPath, platform = process.platform) {
  if (typeof inputPath !== 'string' || inputPath.length === 0) {
    throw new Error('invalid-path');
  }
  const paths = pathModule(platform);
  const normalized = paths.normalize(inputPath).replaceAll('\\', '/');
  return platform === 'win32' ? normalized.toLowerCase() : normalized;
}

export function pathContains(rootPath, candidatePath, platform = process.platform) {
  const root = canonicalPath(rootPath, platform).replace(/\/+$/, '');
  const candidate = canonicalPath(candidatePath, platform);
  return candidate === root || candidate.startsWith(`${root}/`);
}

function linkConflict(workspaceRoot, candidatePath, platform) {
  const runtimeRoot = path.resolve(workspaceRoot);
  const runtimeCandidate = path.resolve(candidatePath);
  if (!pathContains(runtimeRoot, runtimeCandidate, platform)) return null;

  let current = runtimeRoot;
  const relative = path.relative(runtimeRoot, runtimeCandidate);
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    if (!fs.existsSync(current)) break;
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) {
      return { path: candidatePath, reason: 'link-or-reparse-point', linkPath: current };
    }
  }
  return null;
}

function decisionForPath(request, candidatePath) {
  const payload = request.payload || {};
  const platform = payload.platform || process.platform;
  const resolvedPath = canonicalPath(candidatePath, platform);
  const link = linkConflict(request.workspaceRoot, candidatePath, platform);
  if (link) {
    return { path: candidatePath, resolvedPath, decision: 'deny', reason: link.reason, link };
  }

  if (payload.projectAppRoot && pathContains(payload.projectAppRoot, candidatePath, platform)) {
    const appWriter = request.actor?.role === 'project-main' || request.actor?.role === 'integrator';
    if (!payload.allowProjectAppWrite || !appWriter) {
      return {
        path: candidatePath,
        resolvedPath,
        decision: 'deny',
        reason: 'app-write-requires-integrator-authorization',
      };
    }
  }

  const forbidden = (payload.forbiddenPaths || []).find((entry) =>
    pathContains(entry, candidatePath, platform));
  if (forbidden) {
    return { path: candidatePath, resolvedPath, decision: 'deny', reason: 'forbidden-path' };
  }

  const owned = (payload.ownedPaths || []).some((entry) =>
    pathContains(entry, candidatePath, platform));
  if (!owned) {
    return { path: candidatePath, resolvedPath, decision: 'deny', reason: 'outside-owned-paths' };
  }

  return { path: candidatePath, resolvedPath, decision: 'allow', reason: 'owned-path' };
}

function sha256File(filePath) {
  return `sha256:${createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')}`;
}

function protectedConflicts(payload) {
  const conflicts = [];
  for (const artifact of payload.protectedArtifacts || []) {
    if (!artifact?.path || !artifact.sha256) {
      conflicts.push({ path: artifact?.path ?? null, reason: 'invalid-protected-artifact' });
      continue;
    }
    if (!fs.existsSync(artifact.path)) {
      conflicts.push({ path: artifact.path, reason: 'protected-artifact-missing', expectedSha256: artifact.sha256 });
      continue;
    }
    const actualSha256 = sha256File(artifact.path);
    if (actualSha256.toLowerCase() !== String(artifact.sha256).toLowerCase()) {
      conflicts.push({
        path: artifact.path,
        reason: 'protected-artifact-hash-mismatch',
        expectedSha256: artifact.sha256,
        actualSha256,
      });
    }
  }
  return conflicts;
}

export function evaluatePathRequest(request) {
  if (!request || typeof request !== 'object') throw new Error('invalid-request');
  if (!request.workspaceRoot) throw new Error('missing-workspace-root');
  const candidatePaths = request.payload?.candidatePaths;
  if (!Array.isArray(candidatePaths) || candidatePaths.length === 0) {
    throw new Error('missing-candidate-paths');
  }

  const decisions = candidatePaths.map((candidatePath) => decisionForPath(request, candidatePath));
  const conflicts = decisions
    .filter((entry) => entry.link)
    .map((entry) => entry.link)
    .concat(protectedConflicts(request.payload || {}));
  const ok = decisions.every((entry) => entry.decision === 'allow') && conflicts.length === 0;
  return {
    schemaVersion: 1,
    ok,
    operation: request.operation,
    verdict: ok ? 'accepted' : 'denied',
    decisions,
    conflicts,
    errors: [],
  };
}
