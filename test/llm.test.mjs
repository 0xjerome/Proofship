import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

async function importFresh() {
  return import(`../src/llm.mjs?test=${Date.now()}-${Math.random()}`);
}

test('uses deterministic diagnosis when no LLM key exists', async () => {
  const previous = process.env.LLM_API_KEY;
  delete process.env.LLM_API_KEY;
  try {
    const { diagnoseWithLLM } = await importFresh();
    const result = await diagnoseWithLLM({ failedChecks: [{ detail: 'checkout failed' }], deployment: { ready: true } });
    assert.equal(result.source, 'deterministic-fallback');
    assert.equal(result.recommendedAction, 'rollback');
  } finally {
    if (previous == null) delete process.env.LLM_API_KEY; else process.env.LLM_API_KEY = previous;
  }
});

test('healthy deterministic diagnosis agrees with passing production evidence', async () => {
  const previous = process.env.LLM_API_KEY;
  delete process.env.LLM_API_KEY;
  try {
    const { diagnoseWithLLM } = await importFresh();
    const result = await diagnoseWithLLM({ failedChecks: [], deployment: { ready: true } });
    assert.equal(result.source, 'deterministic-fallback');
    assert.equal(result.recommendedAction, 'approve');
    assert.match(result.summary, /all configured production acceptance checks passed/i);
  } finally {
    if (previous == null) delete process.env.LLM_API_KEY; else process.env.LLM_API_KEY = previous;
  }
});

test('falls back safely when a configured LLM returns malformed output', async () => {
  const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ choices: [{ message: { content: 'not json' } }] })); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const previous = { key: process.env.LLM_API_KEY, base: process.env.LLM_BASE_URL };
  process.env.LLM_API_KEY = 'test';
  process.env.LLM_BASE_URL = `http://127.0.0.1:${port}`;
  try {
    const { diagnoseWithLLM } = await importFresh();
    const result = await diagnoseWithLLM({ failedChecks: [{ detail: 'checkout failed' }], deployment: { ready: true } });
    assert.equal(result.source, 'deterministic-fallback');
    assert.match(result.fallbackReason, /LLM did not return JSON/i);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (previous.key == null) delete process.env.LLM_API_KEY; else process.env.LLM_API_KEY = previous.key;
    if (previous.base == null) delete process.env.LLM_BASE_URL; else process.env.LLM_BASE_URL = previous.base;
  }
});
