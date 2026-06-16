/**
 * Boot-time environment sanity check.
 * Validates required Firebase env vars are present.
 */
import { logEvent } from '@/lib/debugLogger';

export function runEnvSanityCheck() {
  const keys = [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_STORAGE_BUCKET',
    'VITE_FIREBASE_MESSAGING_SENDER_ID',
    'VITE_FIREBASE_APP_ID',
  ] as const;

  const issues: string[] = [];

  for (const key of keys) {
    const value = import.meta.env[key];
    if (!value || typeof value !== 'string' || !value.trim()) {
      issues.push(`${key} is missing`);
    }
  }

  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN;
  if (projectId && authDomain && !String(authDomain).includes(String(projectId))) {
    issues.push('VITE_FIREBASE_AUTH_DOMAIN may not match VITE_FIREBASE_PROJECT_ID');
  }

  if (issues.length > 0) {
    issues.forEach((issue) => logEvent('error', `[EnvCheck] ${issue}`));
    console.warn('[VYBE EnvCheck] Configuration issues detected:', issues);
  } else {
    logEvent('info', '[EnvCheck] Firebase environment validated OK');
  }

  return issues;
}
