import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

export function sha256File(filePath) {
  return sha256(readFileSync(filePath));
}

export function createTestRunId() {
  const stamp = new Date().toISOString().replace(/[-:.]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `test-${stamp}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

export function runTestCommand(command, workspaceRoot) {
  if (!command || typeof command.executable !== 'string' || !Array.isArray(command.args)) {
    throw new Error('invalid-test-command');
  }
  const executable = command.executable === 'node' ? process.execPath : command.executable;
  const run = spawnSync(executable, command.args, {
    cwd: workspaceRoot,
    encoding: 'utf8',
    shell: false,
  });
  return {
    exitCode: typeof run.status === 'number' ? run.status : 1,
    stdout: run.stdout || '',
    stderr: run.stderr || run.error?.message || '',
  };
}

function collectFiles(root, current, files) {
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) collectFiles(root, absolute, files);
    else if (entry.isFile()) files.push({
      path: path.relative(root, absolute).replaceAll('\\', '/'),
      sha256: sha256File(absolute),
    });
  }
}

export function sourceManifest(workspaceRoot, sourceRoots) {
  if (!Array.isArray(sourceRoots) || sourceRoots.length === 0) {
    throw new Error('missing-source-roots');
  }
  const files = [];
  for (const sourceRoot of sourceRoots) {
    if (!statSync(sourceRoot).isDirectory()) throw new Error('source-root-not-directory');
    collectFiles(workspaceRoot, sourceRoot, files);
  }
  files.sort((left, right) => left.path.localeCompare(right.path));
  return { files, sha256: sha256(JSON.stringify(files)) };
}

export function writeEvidence(workspaceRoot, taskId, testRunId, kind, evidence) {
  const relativeDir = path.join('run', 'evidence', taskId, testRunId);
  const evidenceDir = path.join(workspaceRoot, relativeDir);
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(path.join(evidenceDir, 'stdout.log'), evidence.observed.stdout, 'utf8');
  writeFileSync(path.join(evidenceDir, 'stderr.log'), evidence.observed.stderr, 'utf8');
  const filename = `${kind}.json`;
  const contents = `${JSON.stringify(evidence, null, 2)}\n`;
  writeFileSync(path.join(evidenceDir, filename), contents, 'utf8');
  return {
    path: path.join(relativeDir, filename).replaceAll('\\', '/'),
    sha256: sha256(contents),
  };
}
