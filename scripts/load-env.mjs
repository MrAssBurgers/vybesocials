import { existsSync, readFileSync } from 'node:fs';

/** Parse `.env` / `.env.local` — skips blanks and comments. */
export function loadEnvFile(path = '.env') {
  const env = {};
  if (!existsSync(path)) return env;
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

export function loadProjectEnv() {
  return { ...loadEnvFile('.env'), ...loadEnvFile('.env.local') };
}
