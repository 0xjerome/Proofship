import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const DATA_FILE = resolve(process.env.PROOFSHIP_DATA_FILE || '.proofship/runs.json');

async function ensureFile() {
  await mkdir(dirname(DATA_FILE), { recursive: true });
  try { await readFile(DATA_FILE, 'utf8'); }
  catch { await writeFile(DATA_FILE, '[]\n', 'utf8'); }
}

export async function listRuns() {
  await ensureFile();
  return JSON.parse(await readFile(DATA_FILE, 'utf8'));
}

export async function saveRun(run) {
  const runs = await listRuns();
  const i = runs.findIndex((r) => r.id === run.id);
  if (i >= 0) runs[i] = run; else runs.unshift(run);
  await writeFile(DATA_FILE, JSON.stringify(runs.slice(0, 100), null, 2) + '\n', 'utf8');
  return run;
}

export async function getRun(id) {
  const runs = await listRuns();
  return runs.find((r) => r.id === id) || null;
}

export async function findRunByFingerprint(fingerprint) {
  if (!fingerprint) return null;
  const runs = await listRuns();
  return runs.find((r) => r.fingerprint === fingerprint && r.status !== 'running') || null;
}
