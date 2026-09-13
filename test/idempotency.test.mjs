import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseFingerprint } from '../src/idempotency.mjs';

test('same release inputs produce the same fingerprint', () => {
  const input = {
    repo: 'acme/app',
    sha: 'abc123',
    deploymentId: 'dpl_123',
    targetUrl: 'https://app.example.com'
  };
  assert.equal(releaseFingerprint(input), releaseFingerprint({ ...input }));
});

test('different deployments produce different fingerprints', () => {
  const base = {
    repo: 'acme/app',
    sha: 'abc123',
    targetUrl: 'https://app.example.com'
  };
  assert.notEqual(
    releaseFingerprint({ ...base, deploymentId: 'dpl_old' }),
    releaseFingerprint({ ...base, deploymentId: 'dpl_new' })
  );
});

test('explicit idempotency keys are stable across webhook payload differences', () => {
  const first = releaseFingerprint({ idempotencyKey: 'deployment:evt_42', sha: 'abc' });
  const retry = releaseFingerprint({ idempotencyKey: 'deployment:evt_42', sha: 'different-shape' });
  assert.equal(first, retry);
});
