import crypto from 'node:crypto';

export function signWebhookBody(body, secret) {
  return `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
}

export function verifyWebhookSignature({ body, signature, secret }) {
  if (!secret) return { required: false, verified: false };
  if (!signature) return { required: true, verified: false };

  const expected = signWebhookBody(body, secret);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== actualBuffer.length) {
    return { required: true, verified: false };
  }

  return {
    required: true,
    verified: crypto.timingSafeEqual(expectedBuffer, actualBuffer)
  };
}
