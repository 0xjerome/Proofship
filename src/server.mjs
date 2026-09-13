import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runReleaseAgent } from './agent.mjs';
import { getRun, listRuns } from './store.mjs';
import { verifyWebhookSignature } from './webhook.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PORT = Number(process.env.PORT || 8787);

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function rawBody(req) {
  let data = '';
  for await (const chunk of req) data += chunk;
  return data;
}

async function body(req) {
  const data = await rawBody(req);
  return data ? JSON.parse(data) : {};
}

async function serveStatic(req, res) {
  const path = req.url === '/' ? '/index.html' : req.url;
  const file = join(ROOT, 'public', path.replace(/^\//, ''));
  try {
    const content = await readFile(file);
    const type = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' }[extname(file)] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': `${type}; charset=utf-8` });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/api/health') {
    return json(res, 200, { ok: true, name: 'ProofShip' });
  }

  if (req.method === 'GET' && url.pathname === '/api/runs') {
    return json(res, 200, await listRuns());
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/runs/')) {
    const run = await getRun(url.pathname.split('/').pop());
    return json(res, run ? 200 : 404, run || { error: 'not found' });
  }

  if (req.method === 'POST' && url.pathname === '/api/webhooks/release') {
    const raw = await rawBody(req);
    const verification = verifyWebhookSignature({
      body: raw,
      signature: req.headers['x-proofship-signature'],
      secret: process.env.PROOFSHIP_WEBHOOK_SECRET
    });

    if (verification.required && !verification.verified) {
      return json(res, 401, { error: 'Invalid webhook signature.' });
    }

    let payload;
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      return json(res, 400, { error: 'Webhook body must be valid JSON.' });
    }

    payload.idempotencyKey = payload.idempotencyKey || req.headers['x-proofship-event-id'] || payload.eventId;
    const run = await runReleaseAgent(payload);
    return json(res, 200, { webhook: verification, run });
  }

  if (req.method === 'POST' && url.pathname === '/api/run') {
    return json(res, 200, await runReleaseAgent(await body(req)));
  }

  if (req.method === 'POST' && url.pathname === '/api/demo') {
    const mode = url.searchParams.get('mode') || 'broken';
    const payload = {
      repo: process.env.DEMO_REPO || '0xjerome/Proofship',
      sha: mode === 'broken' ? '81f7c29badc0ffee' : '42aa19c0ffee1234',
      prNumber: Number(process.env.DEMO_PR_NUMBER || 1),
      deploymentId: mode === 'broken' ? 'dpl_bad_release' : 'dpl_good_release',
      vercelProjectId: process.env.VERCEL_PROJECT_ID || 'demo-project',
      targetUrl: `http://localhost:${PORT}/demo-app?mode=${mode}`,
      goal: 'Prove checkout works after deployment',
      force: true,
      checks: [
        { name: 'Homepage loads', path: '/demo-app?mode=healthy', expectStatus: 200, contains: 'ProofShip Demo Store' },
        { name: 'Checkout completes', path: `/demo-app/checkout?mode=${mode}`, expectStatus: 200, contains: 'PAYMENT_CONFIRMED', critical: true },
        { name: 'Health endpoint', path: '/demo-app/health', expectStatus: 200, contains: 'healthy' }
      ]
    };
    return json(res, 200, await runReleaseAgent(payload));
  }

  if (req.method === 'GET' && url.pathname === '/demo-app') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end('<!doctype html><title>ProofShip Demo Store</title><h1>ProofShip Demo Store</h1><p>Infrastructure says READY.</p>');
  }

  if (req.method === 'GET' && url.pathname === '/demo-app/checkout') {
    const broken = url.searchParams.get('mode') === 'broken';
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end(broken ? 'CHECKOUT_ERROR: missing payment session' : 'PAYMENT_CONFIRMED');
  }

  if (req.method === 'GET' && url.pathname === '/demo-app/health') {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('healthy');
  }

  return serveStatic(req, res);
});

server.listen(PORT, () => console.log(`ProofShip running at http://localhost:${PORT}`));
