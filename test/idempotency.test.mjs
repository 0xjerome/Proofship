import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseFingerprint } from '../src/idempotency.mjs';

test('same release inputs produce the same fingerprint', () => {
  const input = { repo: 'acme/app', sha: 'abc1234', deploymentId: 'dpl_123', targetUrl: 'https://app.example.com' };
  assert.equal(releaseFingerprint(input), releaseFingerprint({ ...input }));
});

test('different deployments produce different fingerprints', () => {
  const base = { repo: 'acme/app', sha: 'abc1234', targetUrl: 'https://app.example.com' };
  assert.notEqual(releaseFingerprint({ ...base, deploymentId: 'dpl_old' }), releaseFingerprint({ ...base, deploymentId: 'dpl_new' }));
});

test('explicit event idempotency keys are stable across payload differences', () => {
  assert.equal(
    releaseFingerprint({ idempotencyKey: 'deployment:evt_42', sha: 'abc1234' }),
    releaseFingerprint({ idempotencyKey: 'deployment:evt_42', sha: 'different' })
  );
});
