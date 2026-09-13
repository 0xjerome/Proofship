import test from 'node:test';
import assert from 'node:assert/strict';
import { decidePolicy } from '../src/policy.mjs';

test('never approves when deployment is not ready', () => {
  assert.equal(decidePolicy({ deploymentReady:false, checks:[], diagnosis:{} }).status, 'blocked');
});

test('blocks a READY deployment when a critical production check fails', () => {
  const r=decidePolicy({deploymentReady:true,checks:[{passed:false,critical:true}],diagnosis:{recommendedAction:'rollback'}});
  assert.equal(r.status,'failed'); assert.equal(r.action,'rollback');
});

test('verifies only when deployment and all checks pass', () => {
  const r=decidePolicy({deploymentReady:true,checks:[{passed:true},{passed:true}],diagnosis:{recommendedAction:'approve'}});
  assert.equal(r.status,'verified'); assert.equal(r.action,'approve');
});
