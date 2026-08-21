import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  createTestRunId,
  runTestCommand,
  sha256File,
  sourceManifest,
  writeEvidence,
} from '../lib/v2-evidence.mjs';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function writeResult(resultPath, result) {
  mkdirSync(path.dirname(resultPath), { recursive: true });
  writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
}

function denied(operation, error) {
  return {
    schemaVersion: 1,
    ok: false,
    operation,
    verdict: 'denied',
    errors: [error],
  };
}

function validateIdentity(payload) {
  if (!payload.taskSpecPath || !payload.taskSpecSha256) {
    throw new Error('missing-task-spec-identity');
  }
  if (sha256File(payload.taskSpecPath) !== payload.taskSpecSha256) {
    throw new Error('task-spec-hash-mismatch');
  }
  if (!Array.isArray(payload.testFiles) || payload.testFiles.length === 0) {
    throw new Error('missing-test-files');
  }
  for (const testFile of payload.testFiles) {
    if (!testFile.path || !testFile.sha256) throw new Error('missing-test-file-identity');
    if (sha256File(testFile.path) !== testFile.sha256) {
      throw new Error('test-file-hash-mismatch');
    }
  }
}

function isExpectedRed(observed, expectedFailure) {
  if (!expectedFailure || typeof expectedFailure.pattern !== 'string') return false;
  const combinedOutput = `${observed.stdout}\n${observed.stderr}`;
  return observed.exitCode === expectedFailure.exitCode
    && combinedOutput.includes(expectedFailure.pattern);
}

function proveRed(request) {
  const payload = request.payload || {};
  validateIdentity(payload);
  const testRunId = createTestRunId();
  const observed = runTestCommand(payload.command, request.workspaceRoot);
  if (!isExpectedRed(observed, payload.expectedFailure)) {
    return denied(request.operation, 'unexpected-red-failure');
  }
  const source = sourceManifest(request.workspaceRoot, payload.sourceRoots);
  const evidence = {
    schemaVersion: 1,
    runId: request.runId,
    taskId: request.taskId,
    operation: request.operation,
    bulletId: payload.bulletId,
    taskRevision: payload.taskRevision,
    testRevision: payload.testRevision,
    testRunId,
    kind: 'red',
    observedAt: new Date().toISOString(),
    taskSpecSha256: payload.taskSpecSha256,
    testFiles: payload.testFiles,
    sourceManifestSha256: source.sha256,
    observed,
  };
  const artifact = writeEvidence(
    request.workspaceRoot,
    request.taskId,
    testRunId,
    'red',
    evidence,
  );
  return {
    schemaVersion: 1,
    ok: true,
    operation: request.operation,
    verdict: 'red',
    cycleState: 'RED',
    test: false,
    testRunId,
    taskRevision: payload.taskRevision,
    testRevision: payload.testRevision,
    taskSpecSha256: payload.taskSpecSha256,
    sourceManifestSha256: source.sha256,
    evidencePath: artifact.path,
    artifacts: [artifact],
    errors: [],
  };
}

function proveGreen(request) {
  const payload = request.payload || {};
  validateIdentity(payload);
  const testRunId = createTestRunId();
  const observed = runTestCommand(payload.command, request.workspaceRoot);
  if (observed.exitCode !== 0) return denied(request.operation, 'green-command-failed');
  const source = sourceManifest(request.workspaceRoot, payload.sourceRoots);
  const evidence = {
    schemaVersion: 1,
    runId: request.runId,
    taskId: request.taskId,
    operation: request.operation,
    bulletId: payload.bulletId,
    taskRevision: payload.taskRevision,
    testRevision: payload.testRevision,
    testRunId,
    kind: 'green',
    observedAt: new Date().toISOString(),
    taskSpecSha256: payload.taskSpecSha256,
    testFiles: payload.testFiles,
    sourceManifestSha256: source.sha256,
    observed,
  };
  const artifact = writeEvidence(
    request.workspaceRoot,
    request.taskId,
    testRunId,
    'green',
    evidence,
  );
  return {
    schemaVersion: 1,
    ok: true,
    operation: request.operation,
    verdict: 'green',
    cycleState: 'GREEN',
    test: false,
    testRunId,
    taskRevision: payload.taskRevision,
    testRevision: payload.testRevision,
    taskSpecSha256: payload.taskSpecSha256,
    sourceManifestSha256: source.sha256,
    evidencePath: artifact.path,
    artifacts: [artifact],
    errors: [],
  };
}

function finalizeTask(request) {
  const payload = request.payload || {};
  if (payload.cycleState !== 'GREEN') {
    return denied(request.operation, 'task-not-green');
  }
  return {
    schemaVersion: 1,
    ok: true,
    operation: request.operation,
    verdict: 'complete',
    cycleState: 'GREEN',
    test: true,
    errors: [],
  };
}

function main() {
  const resultPath = argument('--result');
  let operation = null;
  try {
    if (process.argv[2] !== 'execute') throw new Error('unsupported-verb');
    const requestPath = argument('--request');
    if (!requestPath || !resultPath) throw new Error('missing-request-or-result');
    const request = JSON.parse(readFileSync(requestPath, 'utf8'));
    operation = request.operation;
    const operations = {
      'bullet.prove-red': proveRed,
      'bullet.prove-green': proveGreen,
      'task.finalize': finalizeTask,
    };
    const handler = operations[operation];
    const result = handler ? handler(request) : denied(operation, 'unsupported-operation');
    writeResult(resultPath, result);
    process.exit(result.ok ? 0 : 2);
  } catch (error) {
    if (resultPath) writeResult(resultPath, denied(operation, error.message));
    process.exit(2);
  }
}

main();
