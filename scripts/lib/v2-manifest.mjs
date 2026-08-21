import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export function sha256File(filePath) {
  return `sha256:${createHash('sha256').update(readFileSync(filePath)).digest('hex')}`;
}

export function gitHead(appRoot) {
  const top = spawnSync('git', ['-C', appRoot, 'rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
    shell: false,
  });
  if (top.status !== 0 || path.resolve(top.stdout.trim()) !== path.resolve(appRoot)) {
    throw new Error('app-root-is-not-independent-git-repository');
  }
  const head = spawnSync('git', ['-C', appRoot, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
    shell: false,
  });
  if (head.status !== 0) throw new Error('app-head-unavailable');
  return head.stdout.trim();
}

function resolveManifestPath(root, relativePath, label) {
  if (typeof relativePath !== 'string' || relativePath.length === 0 || path.isAbsolute(relativePath)) {
    throw new Error(`${label}-path-invalid`);
  }
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  const relative = path.relative(resolvedRoot, resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${label}-path-escape`);
  }
  return resolved;
}

export function inspectManifest(payload) {
  if (!payload?.manifest?.moduleId || !Array.isArray(payload.manifest.files)) {
    throw new Error('invalid-manifest');
  }
  if (sha256File(payload.moduleContract.path) !== payload.moduleContract.sha256) {
    throw new Error('module-contract-hash-mismatch');
  }
  const appHead = gitHead(payload.appRoot);
  if (appHead !== payload.appBaseCommit) throw new Error('app-base-commit-mismatch');
  const conflicts = [];
  const seenSources = new Set();
  const seenTargets = new Set();
  const verifiedFiles = payload.manifest.files.map((entry) => {
    const sourcePath = resolveManifestPath(payload.deliveryRoot, entry.source, 'source');
    const targetPath = resolveManifestPath(payload.appRoot, entry.target, 'target');
    const sourceStat = lstatSync(sourcePath);
    if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) throw new Error('source-not-ordinary-file');
    const actualSha256 = sha256File(sourcePath);
    if (seenSources.has(entry.source)) {
      conflicts.push({ source: entry.source, target: entry.target, reason: 'duplicate-source' });
    }
    if (seenTargets.has(entry.target)) {
      conflicts.push({ source: entry.source, target: entry.target, reason: 'duplicate-target' });
    }
    seenSources.add(entry.source);
    seenTargets.add(entry.target);
    if (actualSha256 !== entry.sha256) {
      conflicts.push({
        source: entry.source,
        target: entry.target,
        reason: 'hash-mismatch',
        expectedSha256: entry.sha256,
        actualSha256,
      });
    }
    if (existsSync(targetPath)) {
      conflicts.push({ source: entry.source, target: entry.target, reason: 'target-exists' });
    }
    return {
      source: entry.source,
      target: entry.target,
      sourcePath,
      targetPath,
      sha256: actualSha256,
    };
  });
  return { appHead, verifiedFiles, conflicts };
}
