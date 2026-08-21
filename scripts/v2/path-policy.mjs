import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { evaluatePathRequest } from '../lib/v2-path-policy.mjs';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function writeResult(resultPath, value) {
  mkdirSync(path.dirname(resultPath), { recursive: true });
  writeFileSync(resultPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function main() {
  const resultPath = argument('--result');
  try {
    if (process.argv[2] !== 'check') throw new Error('unsupported-verb');
    const requestPath = argument('--request');
    if (!requestPath || !resultPath) throw new Error('missing-request-or-result');
    const request = JSON.parse(readFileSync(requestPath, 'utf8'));
    const result = evaluatePathRequest(request);
    writeResult(resultPath, result);
    process.exit(result.ok ? 0 : 2);
  } catch (error) {
    if (resultPath) {
      writeResult(resultPath, {
        schemaVersion: 1,
        ok: false,
        operation: null,
        verdict: 'denied',
        decisions: [],
        conflicts: [],
        errors: [error.message],
      });
    }
    process.exit(2);
  }
}

main();
