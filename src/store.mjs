import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const DATA_FILE = resolve(process.env.PROOFSHIP_DATA_FILE || '.proofship/runs.json');
let writeQueue = Promise.resolve();

async function ensureFile() {
  await mkdir(dirname(DATA_FILE), { recursive: true });
  try { await readFile(DATA_FILE, 'utf8'); }
  catch { await writeFile(DATA_FILE, '[]\n', 'utf8'); }
}

async function readRuns() {
  await ensureFile();
  try {
    const parsed = JSON.parse(await readFile(DATA_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function listRuns() {
  return readRuns();
}

export async function saveRun(run) {
  writeQueue = writeQueue.then(async () => {
    const runs = await readRuns();
    const index = runs.findIndex((item) => item.id === run.id);
    if (index >= 0) runs[index] = run;
    else runs.unshift(run);
    const temp = `${DATA_FILE}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify(runs.slice(0, 100), null, 2) + '\n', 'utf8');
    await rename(temp, DATA_FILE);
  });
  await writeQueue;
  return run;
}

export async function getRun(id) {
  const runs = await readRuns();
  return runs.find((item) => item.id === id) || null;
}

export async function findRunByFingerprint(fingerprint) {
  if (!fingerprint) return null;
  const runs = await readRuns();
  return runs.find((item) => item.fingerprint === fingerprint && item.status !== 'running') || null;
}
