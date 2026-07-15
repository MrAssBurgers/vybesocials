type AuthLogData = Record<string, unknown>;

/** Structured OAuth/auth logs. Never pass tokens or private keys. */
export function authLog(message: string, data?: AuthLogData): void {
  if (!import.meta.env.DEV) return;
  try {
    // eslint-disable-next-line no-console
    console.info('[VYBE AUTH]', message, data ?? {});
  } catch {
    /* ignore */
  }
}

export function authWarn(message: string, data?: AuthLogData): void {
  if (!import.meta.env.DEV) return;
  try {
    // eslint-disable-next-line no-console
    console.warn('[VYBE AUTH]', message, data ?? {});
  } catch {
    /* ignore */
  }
}
