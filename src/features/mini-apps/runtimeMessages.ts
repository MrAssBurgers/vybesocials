// Diagnostics are untrusted app output, never authorization or a host API.
export const MINI_APP_RUNTIME_CHANNEL = 'vybe-mini-app-runtime-v1';
export const MINI_APP_MAX_ERRORS = 4;
export const MINI_APP_ERROR_LENGTH = 240;
export const MINI_APP_START_TIMEOUT_MS = 10_000;

export type MiniAppRuntimeMessage =
  | { kind: 'ready' }
  | { kind: 'error'; message: string };

export function readMiniAppRuntimeMessage(value: unknown, runId: string): MiniAppRuntimeMessage | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  if (data.channel !== MINI_APP_RUNTIME_CHANNEL || data.runId !== runId) return null;
  if (data.kind === 'ready') return { kind: 'ready' };
  if (data.kind !== 'error' || typeof data.message !== 'string') return null;
  const message = data.message.slice(0, MINI_APP_ERROR_LENGTH).trim();
  return message ? { kind: 'error', message } : null;
}
