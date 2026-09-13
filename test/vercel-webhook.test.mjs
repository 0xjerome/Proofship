import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptVercelWebhook, signVercelWebhookBody, verifyVercelWebhookSignature } from '../src/vercel-webhook.mjs';

test('verifies the native Vercel HMAC signature', () => {
  const body = JSON.stringify({ type: 'deployment.ready', id: 'evt_1' });
  const secret = 'vercel-secret';
  const signature = signVercelWebhookBody(body, secret);
  assert.equal(verifyVercelWebhookSignature({ body, signature, secret }).verified, true);
  assert.equal(verifyVercelWebhookSignature({ body: `${body}x`, signature, secret }).verified, false);
});

test('adapts a production deployment.ready event into a ProofShip release', () => {
  const event = {
    id: 'evt_1',
    type: 'deployment.ready',
    payload: {
      target: 'production',
      project: { id: 'prj_1' },
      deployment: {
        id: 'dpl_1',
        url: 'shop.example.com',
        meta: { githubOrg: 'acme', githubRepo: 'shop', githubCommitSha: 'abcdef123456' }
      }
    }
  };
  const env = {
    PROOFSHIP_CHECKS_JSON: JSON.stringify([{ name: 'Home', path: '/', expectStatus: 200 }])
  };
  const adapted = adaptVercelWebhook(event, env);
  assert.equal(adapted.ignored, false);
  assert.equal(adapted.input.repo, 'acme/shop');
  assert.equal(adapted.input.sha, 'abcdef123456');
  assert.equal(adapted.input.targetUrl, 'https://shop.example.com');
  assert.equal(adapted.input.idempotencyKey, 'vercel:dpl_1');
});

test('ignores non-production Vercel deployment events', () => {
  const adapted = adaptVercelWebhook({
    type: 'deployment.ready',
    payload: { target: 'preview', deployment: { id: 'dpl_preview' } }
  }, {});
  assert.equal(adapted.ignored, true);
});
