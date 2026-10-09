// Local secrets file, outside the repo. Never commit its contents.
// Default: ~/.config/prpp/backend.env (override with PRPP_ENV_FILE).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const ENV_FILE = process.env.PRPP_ENV_FILE ?? join(homedir(), '.config', 'prpp', 'backend.env');

export const env = loadEnv();

function loadEnv() {
  const out = {};
  if (!existsSync(ENV_FILE)) {
    return out;
  }
  for (const line of readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) {
      out[m[1]] = m[2];
    }
  }
  return out;
}

/** Store a generated value (id, password, secret) in the local secrets file. */
export function saveEnv(key, value) {
  env[key] = value;
  const lines = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8').split('\n').filter(Boolean) : [];
  const next = lines.filter((l) => !l.startsWith(`${key}=`));
  next.push(`${key}=${value}`);
  writeFileSync(ENV_FILE, next.join('\n') + '\n', { mode: 0o600 });
}

export function required(key) {
  const value = env[key];
  if (!value) {
    throw new Error(`Missing ${key} in ${ENV_FILE}`);
  }
  return value;
}

export function baseUrl() {
  return required('MEDPLUM_BASE_URL').replace(/\/?$/, '/');
}
