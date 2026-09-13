import test from 'node:test';
import assert from 'node:assert/strict';
import { decidePolicy } from '../src/policy.mjs';

test('never approves when deployment is not ready', () => {
  const result = decidePolicy({ deploymentReady: false, checks: [{ passed: true }], diagnosis: {} });
  assert.equal(result.status, 'blocked');
});

test('never approves a release with zero authoritative checks', () => {
  const result = decidePolicy({ deploymentReady: true, checks: [], diagnosis: { recommendedAction: 'approve' } });
  assert.equal(result.status, 'blocked');
  assert.match(result.reason, /No production acceptance checks/i);
});

test('blocks a READY deployment when a critical production check fails', () => {
  const result = decidePolicy({
    deploymentReady: true,
    checks: [{ passed: false, critical: true }],
    diagnosis: { recommendedAction: 'approve' }
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.action, 'rollback');
});

test('verifies only when deployment and all checks pass', () => {
  const result = decidePolicy({
    deploymentReady: true,
    checks: [{ passed: true }, { passed: true }],
    diagnosis: { recommendedAction: 'approve' }
  });
  assert.equal(result.status, 'verified');
  assert.equal(result.action, 'approve');
});
