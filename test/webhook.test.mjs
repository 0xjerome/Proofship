import test from 'node:test';
import assert from 'node:assert/strict';
import { signWebhookBody, verifyWebhookSignature } from '../src/webhook.mjs';

test('accepts a valid signed webhook body', () => {
  const body = JSON.stringify({ eventId: 'evt_42', sha: 'abc123' });
  const secret = 'test-secret';
  const signature = signWebhookBody(body, secret);
  assert.deepEqual(
    verifyWebhookSignature({ body, signature, secret }),
    { required: true, verified: true }
  );
});

test('rejects a tampered webhook body', () => {
  const original = JSON.stringify({ eventId: 'evt_42', sha: 'abc123' });
  const tampered = JSON.stringify({ eventId: 'evt_42', sha: 'evil' });
  const secret = 'test-secret';
  const signature = signWebhookBody(original, secret);
  assert.deepEqual(
    verifyWebhookSignature({ body: tampered, signature, secret }),
    { required: true, verified: false }
  );
});

test('webhook signing is optional when no secret is configured', () => {
  assert.deepEqual(
    verifyWebhookSignature({ body: '{}', signature: undefined, secret: '' }),
    { required: false, verified: false }
  );
});
