import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = await mkdtemp(join(tmpdir(), 'proofship-agent-test-'));
process.env.PROOFSHIP_DATA_FILE = join(directory, 'runs.json');
const { runReleaseAgent } = await import('../src/agent.mjs');
after(() => rm(directory, { recursive: true, force: true }));

async function withTarget(fn) {
  const server = http.createServer((req, res) => {
    if (req.url === '/checkout?mode=broken') { res.writeHead(200); return res.end('CHECKOUT_ERROR'); }
    if (req.url === '/checkout?mode=healthy') { res.writeHead(200); return res.end('PAYMENT_CONFIRMED'); }
    res.writeHead(200); res.end('healthy');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try { await fn(`http://127.0.0.1:${port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test('simulated broken release is blocked, actions run, and recovery is reverified', async () => {
  await withTarget(async (targetUrl) => {
    const run = await runReleaseAgent({
      repo: 'acme/shop',
      sha: 'abcdef123456',
      deploymentId: 'dpl_bad',
      vercelProjectId: 'prj_1',
      targetUrl,
      simulateExternal: true,
      autoRollback: true,
      force: true,
      checks: [{ name: 'Checkout', path: '/checkout?mode=broken', expectStatus: 200, contains: 'PAYMENT_CONFIRMED', critical: true }],
      recoveryChecks: [{ name: 'Checkout', path: '/checkout?mode=healthy', expectStatus: 200, contains: 'PAYMENT_CONFIRMED', critical: true }]
    });
    assert.equal(run.status, 'failed');
    assert.equal(run.serviceStatus, 'recovered');
    assert.equal(run.recovery.verified, true);
    assert(run.actions.some((action) => action.app === 'linear'));
    assert(run.actions.some((action) => action.app === 'github'));
    assert(run.actions.some((action) => action.app === 'slack'));
    assert(run.actions.some((action) => action.app === 'vercel' && action.action === 'rollback'));
  });
});

test('healthy simulated release is verified without incident actions', async () => {
  await withTarget(async (targetUrl) => {
    const run = await runReleaseAgent({
      repo: 'acme/shop', sha: 'abcdef789012', deploymentId: 'dpl_good', targetUrl,
      simulateExternal: true, force: true,
      checks: [{ name: 'Checkout', path: '/checkout?mode=healthy', expectStatus: 200, contains: 'PAYMENT_CONFIRMED', critical: true }]
    });
    assert.equal(run.status, 'verified');
    assert.equal(run.serviceStatus, 'healthy');
    assert.equal(run.actions.length, 0);
  });
});
