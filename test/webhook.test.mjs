import test from 'node:test';
import assert from 'node:assert/strict';
import { signWebhookBody, verifyWebhookSignature } from '../src/webhook.mjs';

test('accepts a valid generic signed webhook body', () => {
  const body = JSON.stringify({ eventId: 'evt_42', sha: 'abc123' });
  const secret = 'test-secret';
  const signature = signWebhookBody(body, secret);
  assert.equal(verifyWebhookSignature({ body, signature, secret }).verified, true);
});

test('rejects a tampered generic webhook body', () => {
  const original = JSON.stringify({ eventId: 'evt_42', sha: 'abc123' });
  const tampered = JSON.stringify({ eventId: 'evt_42', sha: 'evil' });
  const secret = 'test-secret';
  const signature = signWebhookBody(original, secret);
  assert.equal(verifyWebhookSignature({ body: tampered, signature, secret }).verified, false);
});

test('generic webhook endpoint requires a configured secret', () => {
  const result = verifyWebhookSignature({ body: '{}', signature: undefined, secret: '' });
  assert.equal(result.configured, false);
  assert.equal(result.verified, false);
});
