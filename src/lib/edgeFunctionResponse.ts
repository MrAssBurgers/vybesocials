/** Parse supabase.functions.invoke results including non-2xx JSON bodies. */
export async function parseEdgeInvokeResult<T extends Record<string, unknown> = Record<string, unknown>>(
  result: { data: T | null; error: { message?: string; context?: Response } | null },
): Promise<{ payload: T | null; errorCode?: string; errorMessage?: string }> {
  let payload = result.data;

  if (!payload && result.error?.context) {
    const ctx = result.error.context;
    try {
      if (typeof ctx.json === 'function') {
        payload = (await ctx.json()) as T;
      } else if (typeof ctx.text === 'function') {
        const txt = await ctx.text();
        if (txt) payload = JSON.parse(txt) as T;
      }
    } catch {
      /* ignore parse errors */
    }
  }

  const errorCode = typeof (payload as Record<string, unknown> | null)?.error === 'string'
    ? ((payload as Record<string, unknown>).error as string)
    : undefined;

  return {
    payload,
    errorCode,
    errorMessage: result.error?.message,
  };
}

export function gateVerifyErrorMessage(code?: string): string {
  switch (code) {
    case 'wrong_code':
      return 'Incorrect code — check and try again';
    case 'challenge_expired':
      return 'Code expired — request a new one';
    case 'challenge_used':
    case 'challenge_not_found':
      return 'This code is no longer valid — request a new one';
    case 'too_many_attempts':
      return 'Too many attempts — request a new code';
    case 'twilio_not_configured':
      return 'SMS verification is temporarily unavailable';
    case 'invalid_code_format':
      return 'Enter the full 6-digit code';
    case 'server_error':
      return 'Verification failed — try again in a moment';
    default:
      return 'Invalid or expired code';
  }
}

export function pushDeliveryErrorMessage(payload: Record<string, unknown> | null | undefined): string {
  if (!payload || payload.success === true) return '';

  const err = typeof payload.error === 'string' ? payload.error : '';
  const onesignal = payload.onesignal as Record<string, unknown> | null | undefined;
  const osErrors = onesignal?.errors;

  if (err === 'No push tokens found') {
    return 'This device is not registered for push yet. Turn notifications off and on again, then tap Allow when prompted.';
  }
  if (err === 'VAPID keys not configured for web push') {
    return 'Web push is not configured on the server yet.';
  }
  if (Array.isArray(osErrors) && osErrors.some((e) => String(e).includes('No actively subscribed'))) {
    return 'Notifications are not linked on this device yet. Toggle push off/on after allowing permission in Settings.';
  }
  if (typeof onesignal === 'object' && onesignal && onesignal.ok === false && !err) {
    return 'OneSignal could not deliver to this device. Re-enable push notifications and try again.';
  }

  return err || 'Push was not delivered to any device.';
}

export function phoneVerifyErrorMessage(code?: string): string {
  switch (code) {
    case 'wrong_code':
      return 'Incorrect code';
    case 'challenge_expired':
      return 'Code expired — send a new one';
    case 'too_many_attempts':
      return 'Too many tries — send a new code';
    case 'twilio_not_configured':
      return 'SMS service is not configured. Contact support.';
    default:
      return code ? `Could not verify (${code})` : 'Could not verify';
  }
}
