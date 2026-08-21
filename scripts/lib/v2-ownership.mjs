import { createHash, randomBytes } from 'node:crypto';

export function projectSessionId(actorSessionId) {
  if (typeof actorSessionId === 'string' && /^P-S-[A-Za-z0-9-]+$/.test(actorSessionId)) {
    return actorSessionId;
  }
  const stamp = new Date().toISOString().replace(/[-:.]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `P-S-${stamp}-${randomBytes(4).toString('hex').toUpperCase()}`;
}

export function ownershipMeta(sessionId, epoch = 1) {
  return {
    ownerSessionId: sessionId,
    ownershipEpoch: epoch,
  };
}

export function sha256Text(value) {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}
