import crypto from 'node:crypto';

export function releaseFingerprint(input = {}) {
  const source = input.idempotencyKey || [
    input.repo || '',
    input.sha || '',
    input.deploymentId || '',
    input.targetUrl || ''
  ].join('|');
  return crypto.createHash('sha256').update(source).digest('hex');
}
