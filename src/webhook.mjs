import crypto from 'node:crypto';

export function signWebhookBody(body, secret) {
  return `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
}

export function verifyWebhookSignature({ body, signature, secret }) {
  if (!secret) return { required: true, configured: false, verified: false };
  if (!signature) return { required: true, configured: true, verified: false };

  const expected = signWebhookBody(body, secret);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(String(signature));
  if (expectedBuffer.length !== actualBuffer.length) {
    return { required: true, configured: true, verified: false };
  }
  return {
    required: true,
    configured: true,
    verified: crypto.timingSafeEqual(expectedBuffer, actualBuffer)
  };
}
