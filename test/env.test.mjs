import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnvText, loadEnvFile } from '../src/env.mjs';

test('parses quoted and unquoted environment values', () => {
  const parsed = parseEnvText('A=one\nB="two words"\nC=three # comment\n');
  assert.deepEqual(parsed, { A: 'one', B: 'two words', C: 'three' });
});

test('loads .env values without overriding existing environment variables', () => {
  const dir = mkdtempSync(join(tmpdir(), 'proofship-env-'));
  const file = join(dir, '.env');
  writeFileSync(file, 'GITHUB_TOKEN=file-token\nSLACK_WEBHOOK_URL=https://example.test/hook\n');
  const env = { GITHUB_TOKEN: 'shell-token' };
  try {
    const result = loadEnvFile(file, env);
    assert.equal(result.loaded, true);
    assert.equal(env.GITHUB_TOKEN, 'shell-token');
    assert.equal(env.SLACK_WEBHOOK_URL, 'https://example.test/hook');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
