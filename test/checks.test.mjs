import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { runAcceptanceChecks } from '../src/checks.mjs';

async function withServer(fn) {
  const server = http.createServer((req, res) => {
    if (req.url === '/good') { res.writeHead(200); return res.end('PAYMENT_CONFIRMED'); }
    if (req.url === '/bad') { res.writeHead(200); return res.end('CHECKOUT_ERROR'); }
    res.writeHead(404); res.end('not found');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try { await fn(`http://127.0.0.1:${port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test('acceptance checks verify actual response behavior', async () => {
  await withServer(async (base) => {
    const results = await runAcceptanceChecks(base, [
      { name: 'good', path: '/good', expectStatus: 200, contains: 'PAYMENT_CONFIRMED' },
      { name: 'bad', path: '/bad', expectStatus: 200, contains: 'PAYMENT_CONFIRMED' }
    ]);
    assert.equal(results[0].passed, true);
    assert.equal(results[1].passed, false);
  });
});

test('acceptance checks refuse cross-origin URLs by default', async () => {
  await withServer(async (base) => {
    const results = await runAcceptanceChecks(base, [{ name: 'external', path: 'https://example.com/', expectStatus: 200 }]);
    assert.equal(results[0].passed, false);
    assert.match(results[0].detail, /cross-origin/i);
  });
});
