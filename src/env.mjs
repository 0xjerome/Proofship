import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function parseEnvText(text) {
  const values = {};
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('export ')) line = line.slice(7).trim();

    const index = line.indexOf('=');
    if (index <= 0) continue;
    const key = line.slice(0, index).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      const quote = value[0];
      value = value.slice(1, -1);
      if (quote === '"') {
        value = value.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      }
    } else {
      const comment = value.search(/\s+#/);
      if (comment >= 0) value = value.slice(0, comment).trim();
    }
    values[key] = value;
  }
  return values;
}

export function loadEnvFile(filePath = process.env.PROOFSHIP_ENV_FILE || '.env', env = process.env) {
  const path = resolve(filePath);
  if (!existsSync(path)) return { loaded: false, path, count: 0 };
  const values = parseEnvText(readFileSync(path, 'utf8'));
  let count = 0;
  for (const [key, value] of Object.entries(values)) {
    if (env[key] == null) {
      env[key] = value;
      count += 1;
    }
  }
  return { loaded: true, path, count };
}

loadEnvFile();
