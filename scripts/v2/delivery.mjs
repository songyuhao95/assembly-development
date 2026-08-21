import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { inspectManifest } from '../lib/v2-manifest.mjs';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function writeResult(resultPath, result) {
  mkdirSync(path.dirname(resultPath), { recursive: true });
  writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
}

function denied(operation, errors, conflicts = []) {
  return {
    schemaVersion: 1,
    ok: false,
    operation,
    verdict: 'denied',
    verifiedFiles: [],
    conflicts,
    errors: Array.isArray(errors) ? errors : [errors],
  };
}

function verify(request) {
  const inspected = inspectManifest(request.payload);
  if (inspected.conflicts.length > 0) {
    return denied(
      request.operation,
      inspected.conflicts.map((entry) => entry.reason),
      inspected.conflicts,
    );
  }
  return {
    schemaVersion: 1,
    ok: true,
    operation: request.operation,
    verdict: 'accepted',
    verifiedFiles: inspected.verifiedFiles,
    conflicts: inspected.conflicts,
    appHead: inspected.appHead,
    errors: [],
  };
}

function promote(request) {
  const owner = request.payload?.promotionOwner;
  const isProjectIntegrator = request.actor?.role === 'project-main'
    && request.actor?.sessionId === owner?.sessionId
    && Number(request.actor?.ownershipEpoch) === Number(owner?.ownershipEpoch);
  if (!isProjectIntegrator) return denied(request.operation, 'non-integrator-promotion');
  return denied(request.operation, 'verified-staging-required');
}

function main() {
  const resultPath = argument('--result');
  let operation = null;
  try {
    const verb = process.argv[2];
    const requestPath = argument('--request');
    if (!requestPath || !resultPath) throw new Error('missing-request-or-result');
    const request = JSON.parse(readFileSync(requestPath, 'utf8'));
    operation = request.operation;
    let result;
    if (verb === 'verify' && operation === 'delivery.verify') result = verify(request);
    else if (verb === 'promote' && operation === 'delivery.promote') result = promote(request);
    else result = denied(operation, 'unsupported-operation');
    writeResult(resultPath, result);
    process.exit(result.ok ? 0 : 2);
  } catch (error) {
    if (resultPath) writeResult(resultPath, denied(operation, error.message));
    process.exit(2);
  }
}

main();
