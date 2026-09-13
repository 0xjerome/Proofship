import './env.mjs';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runReleaseAgent } from './agent.mjs';
import { getRun, listRuns } from './store.mjs';
import { verifyWebhookSignature } from './webhook.mjs';
import { adaptVercelWebhook, verifyVercelWebhookSignature } from './vercel-webhook.mjs';
import { envBoolean, getRuntimeConfig } from './config.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PUBLIC_ROOT = resolve(ROOT, 'public');
const PORT = Number(process.env.PORT || 8787);
const BODY_LIMIT = 1024 * 1024;

function securityHeaders() {
  return {
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"
  };
}

function json(res, status, body) {
  res.writeHead(status, {
    ...securityHeaders(),
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  res.end(JSON.stringify(body));
}

function authorized(req) {
  const key = process.env.PROOFSHIP_API_KEY;
  if (!key) return true;
  const supplied = req.headers['x-proofship-api-key'] || String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return supplied === key;
}

async function rawBody(req) {
  let data = '';
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > BODY_LIMIT) {
      const error = new Error('Request body exceeds 1 MB.');
      error.statusCode = 413;
      throw error;
    }
    data += chunk;
  }
  return data;
}

async function parseJsonBody(req) {
  const raw = await rawBody(req);
  if (!raw) return {};
  try { return JSON.parse(raw); }
  catch {
    const error = new Error('Request body must be valid JSON.');
    error.statusCode = 400;
    throw error;
  }
}

function dispatchRelease(input) {
  setImmediate(() => {
    runReleaseAgent(input).catch((error) => console.error('ProofShip background release error:', error));
  });
}

async function serveStatic(pathname, res) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); }
  catch { return json(res, 400, { error: 'Invalid URL encoding.' }); }
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const file = resolve(PUBLIC_ROOT, relative);
  if (file !== PUBLIC_ROOT && !file.startsWith(`${PUBLIC_ROOT}${sep}`)) {
    return json(res, 403, { error: 'Forbidden.' });
  }
  try {
    const content = await readFile(file);
    const type = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'text/javascript',
      '.svg': 'image/svg+xml',
      '.json': 'application/json'
    }[extname(file)] || 'application/octet-stream';
    res.writeHead(200, { ...securityHeaders(), 'content-type': `${type}; charset=utf-8` });
    res.end(content);
  } catch {
    json(res, 404, { error: 'Not found.' });
  }
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/api/health') {
    return json(res, 200, { ok: true, name: 'ProofShip', version: '1.0.0' });
  }
  if (req.method === 'GET' && url.pathname === '/api/config') {
    return json(res, 200, getRuntimeConfig());
  }
  if (req.method === 'GET' && url.pathname === '/api/runs') {
    return json(res, 200, await listRuns());
  }
  if (req.method === 'GET' && url.pathname.startsWith('/api/runs/')) {
    const run = await getRun(url.pathname.split('/').pop());
    return json(res, run ? 200 : 404, run || { error: 'not found' });
  }

  if (req.method === 'POST' && url.pathname === '/api/webhooks/vercel') {
    const raw = await rawBody(req);
    const verification = verifyVercelWebhookSignature({
      body: raw,
      signature: req.headers['x-vercel-signature'],
      secret: process.env.VERCEL_WEBHOOK_SECRET
    });
    if (!verification.configured) return json(res, 503, { error: 'VERCEL_WEBHOOK_SECRET is not configured.' });
    if (!verification.verified) return json(res, 403, { error: 'Invalid Vercel webhook signature.' });
    if (!process.env.VERCEL_TOKEN) return json(res, 503, { error: 'VERCEL_TOKEN is required for automatic Vercel verification.' });

    let event;
    try { event = raw ? JSON.parse(raw) : {}; }
    catch { return json(res, 400, { error: 'Webhook body must be valid JSON.' }); }
    const adapted = adaptVercelWebhook(event);
    if (adapted.ignored) return json(res, 202, adapted);
    if (adapted.configError) return json(res, 503, { error: adapted.configError });
    dispatchRelease(adapted.input);
    return json(res, 202, { accepted: true, eventId: event.id || null, deploymentId: adapted.input.deploymentId });
  }

  if (req.method === 'POST' && url.pathname === '/api/webhooks/release') {
    const raw = await rawBody(req);
    const verification = verifyWebhookSignature({
      body: raw,
      signature: req.headers['x-proofship-signature'],
      secret: process.env.PROOFSHIP_WEBHOOK_SECRET
    });
    if (!verification.configured) return json(res, 503, { error: 'PROOFSHIP_WEBHOOK_SECRET is not configured.' });
    if (!verification.verified) return json(res, 401, { error: 'Invalid webhook signature.' });

    let payload;
    try { payload = raw ? JSON.parse(raw) : {}; }
    catch { return json(res, 400, { error: 'Webhook body must be valid JSON.' }); }
    payload.idempotencyKey = payload.idempotencyKey || req.headers['x-proofship-event-id'] || payload.eventId;
    payload.source = payload.source || 'signed-release-webhook';
    dispatchRelease(payload);
    return json(res, 202, { accepted: true, eventId: payload.idempotencyKey || null });
  }

  if (req.method === 'POST' && url.pathname === '/api/run') {
    if (!authorized(req)) return json(res, 401, { error: 'Invalid ProofShip API key.' });
    const run = await runReleaseAgent(await parseJsonBody(req));
    return json(res, run.status === 'invalid' ? 400 : 200, run);
  }

  if (req.method === 'POST' && url.pathname === '/api/demo') {
    const mode = url.searchParams.get('mode') === 'healthy' ? 'healthy' : 'broken';
    const liveDemo = envBoolean('DEMO_LIVE_INTEGRATIONS', false);
    const payload = {
      repo: liveDemo ? process.env.DEMO_REPO : '0xjerome/Proofship',
      sha: liveDemo ? process.env.DEMO_SHA : (mode === 'broken' ? '81f7c29badc0ffee' : '42aa19c0ffee1234'),
      prNumber: liveDemo && process.env.DEMO_PR_NUMBER ? Number(process.env.DEMO_PR_NUMBER) : 1,
      deploymentId: liveDemo ? process.env.DEMO_DEPLOYMENT_ID : (mode === 'broken' ? 'dpl_bad_release' : 'dpl_good_release'),
      vercelProjectId: liveDemo ? process.env.DEMO_VERCEL_PROJECT_ID : 'demo-project',
      vercelTeamId: liveDemo ? process.env.VERCEL_TEAM_ID : undefined,
      rollbackDeploymentId: liveDemo ? process.env.DEMO_ROLLBACK_DEPLOYMENT_ID : undefined,
      targetUrl: liveDemo ? process.env.DEMO_TARGET_URL : `http://localhost:${PORT}/demo-app`,
      goal: 'Prove checkout works after deployment',
      force: true,
      simulateExternal: !liveDemo,
      autoRollback: liveDemo ? envBoolean('DEMO_AUTO_ROLLBACK', false) : true,
      checks: [
        { name: 'Homepage loads', path: '/demo-app?mode=healthy', expectStatus: 200, contains: 'ProofShip Demo Store' },
        { name: 'Checkout completes', path: `/demo-app/checkout?mode=${mode}`, expectStatus: 200, contains: 'PAYMENT_CONFIRMED', critical: true },
        { name: 'Health endpoint', path: '/demo-app/health', expectStatus: 200, contains: 'healthy' }
      ],
      recoveryChecks: [
        { name: 'Homepage loads', path: '/demo-app?mode=healthy', expectStatus: 200, contains: 'ProofShip Demo Store' },
        { name: 'Checkout completes', path: '/demo-app/checkout?mode=healthy', expectStatus: 200, contains: 'PAYMENT_CONFIRMED', critical: true },
        { name: 'Health endpoint', path: '/demo-app/health', expectStatus: 200, contains: 'healthy' }
      ],
      source: 'demo'
    };
    const run = await runReleaseAgent(payload);
    return json(res, run.status === 'invalid' ? 400 : 200, run);
  }

  if (req.method === 'GET' && url.pathname === '/demo-app') {
    res.writeHead(200, { ...securityHeaders(), 'content-type': 'text/html; charset=utf-8' });
    return res.end('<!doctype html><title>ProofShip Demo Store</title><h1>ProofShip Demo Store</h1><p>Infrastructure says READY.</p>');
  }
  if (req.method === 'GET' && url.pathname === '/demo-app/checkout') {
    const broken = url.searchParams.get('mode') === 'broken';
    res.writeHead(200, { ...securityHeaders(), 'content-type': 'text/plain; charset=utf-8' });
    return res.end(broken ? 'CHECKOUT_ERROR: missing payment session' : 'PAYMENT_CONFIRMED');
  }
  if (req.method === 'GET' && url.pathname === '/demo-app/health') {
    res.writeHead(200, { ...securityHeaders(), 'content-type': 'text/plain; charset=utf-8' });
    return res.end('healthy');
  }

  return serveStatic(url.pathname, res);
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    if (res.headersSent) return res.end();
    json(res, error.statusCode || 500, { error: error.statusCode ? error.message : 'Internal server error.' });
  });
});

server.listen(PORT, () => console.log(`ProofShip v1.0.0 running at http://localhost:${PORT}`));
