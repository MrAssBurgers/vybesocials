/** Parse db.functions.invoke results including non-2xx JSON bodies. */
export async function parseEdgeInvokeResult<T = any>(
  result: { data: T | null; error: { message?: string; context?: any } | null | any },
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
    case 'permission-denied':
      return 'Incorrect code or this sign-in request is no longer available';
    case 'failed-precondition':
      return 'This sign-in request expired or changed — please sign in again';
    case 'unavailable':
    case 'deadline-exceeded':
    case 'internal':
    case 'network-request-failed':
    case 'auth/network-request-failed':
      return 'Verification is unavailable — check your connection and try again';
    case 'resource-exhausted':
      return 'Too many attempts — please try again later';
    case 'invalid-argument':
      return 'Enter the full six-digit code';
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
  if (!payload) return 'Push was not delivered to any device.';

  const sent = typeof payload.sent === 'number' ? payload.sent : undefined;
  const delivered =
    payload.success === true || (payload.ok === true && sent !== undefined && sent > 0);
  if (delivered) return '';

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
