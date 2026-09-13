import test from 'node:test';
import assert from 'node:assert/strict';
import { validateReleaseInput } from '../src/validate.mjs';

const base = {
  repo: 'acme/shop',
  sha: 'abcdef123456',
  deploymentId: 'dpl_123',
  targetUrl: 'https://shop.example.com',
  checks: [{ name: 'Homepage', path: '/', expectStatus: 200 }]
};

test('validates a complete release request', () => {
  const result = validateReleaseInput(base);
  assert.equal(result.ok, true);
  assert.equal(result.value.checks[0].method, 'GET');
});

test('rejects release requests without checks', () => {
  const result = validateReleaseInput({ ...base, checks: [] });
  assert.equal(result.ok, false);
  assert(result.errors.some((value) => /At least one production acceptance check/.test(value)));
});

test('rejects non-http production targets', () => {
  const result = validateReleaseInput({ ...base, targetUrl: 'file:///etc/passwd' });
  assert.equal(result.ok, false);
});
