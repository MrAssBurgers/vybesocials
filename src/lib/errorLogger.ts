import { logEvent } from '@/lib/debugLogger';

/**
 * Centralized error logger.
 * Logs to the in-memory debug panel and optionally to console in dev.
 * Never logs sensitive data (tokens, passwords, etc.).
 */
export function logError(error: unknown, context?: string) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  // Skip auth guard errors — they're user-facing, not bugs
  if (error instanceof Error && (error as any).isAuthGuard) return;

  // Scrub sensitive patterns
  const safeMessage = scrubSensitive(message);

  logEvent('error', `${context ? `[${context}] ` : ''}${safeMessage}`, {
    ...(stack ? { stack: scrubSensitive(stack) } : {}),
  });

  if (import.meta.env.DEV) {
    console.error(`[${context || 'App'}]`, error);
  }
}

function scrubSensitive(text: string): string {
  return text
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[JWT_REDACTED]')
    .replace(/password['":\s]*['"][^'"]+['"]/gi, 'password:[REDACTED]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]');
}
