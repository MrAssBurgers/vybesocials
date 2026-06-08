/**
 * Enqueue login verification codes into the high-priority auth_emails pgmq queue.
 * Same pipeline as auth-email-hook — more reliable than nested edge invokes.
 */
import * as React from 'npm:react@18.3.1';
import { renderAsync } from 'npm:@react-email/components@0.0.22';
import { getServiceClient, sendTransactional } from './security.ts';
import { template as loginVerificationTemplate } from './transactional-email-templates/login-verification.tsx';

const SITE_NAME = 'VYBE';
const SENDER_DOMAIN = 'notify.vybehub.app';
const FROM_DOMAIN = 'vybehub.app';

export async function enqueueLoginVerificationEmail(opts: {
  recipient: string;
  code: string;
  ip?: string;
  city?: string | null;
  country?: string | null;
  device?: string;
  idempotencyKey: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const admin = getServiceClient();
    const props = {
      code: opts.code,
      ip: opts.ip,
      city: opts.city,
      country: opts.country,
      device: opts.device,
    };
    const Component: any = (loginVerificationTemplate as any).component;
    const subject =
      typeof (loginVerificationTemplate as any).subject === 'function'
        ? (loginVerificationTemplate as any).subject(props)
        : (loginVerificationTemplate as any).subject || 'Your VYBE login code';
    const html = await renderAsync(React.createElement(Component, props));
    const text = await renderAsync(React.createElement(Component, props), { plainText: true });

    const messageId = crypto.randomUUID();

    await admin.from('email_send_log').insert({
      message_id: messageId,
      template_name: 'login-verification',
      recipient_email: opts.recipient,
      status: 'pending',
    });

    const { error: enqueueError } = await admin.rpc('enqueue_email', {
      queue_name: 'auth_emails',
      payload: {
        message_id: messageId,
        to: opts.recipient,
        from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject,
        html,
        text,
        purpose: 'transactional',
        label: 'login-verification',
        idempotency_key: opts.idempotencyKey,
        queued_at: new Date().toISOString(),
      },
    });

    if (enqueueError) {
      console.error('enqueueLoginVerificationEmail failed', enqueueError);
      await admin.from('email_send_log').insert({
        message_id: messageId,
        template_name: 'login-verification',
        recipient_email: opts.recipient,
        status: 'failed',
        error_message: enqueueError.message || 'enqueue failed',
      });
      return { ok: false, error: enqueueError.message || 'enqueue failed' };
    }
    return { ok: true };
  } catch (e) {
    const msg = (e as any)?.message || String(e);
    console.error('enqueueLoginVerificationEmail exception', msg);
    return { ok: false, error: msg };
  }
}

/** Primary: auth_emails queue. Fallback: send-transactional-email edge fn. */
export async function sendLoginVerificationEmail(opts: {
  recipient: string;
  code: string;
  ip?: string;
  city?: string | null;
  country?: string | null;
  device?: string;
  idempotencyKey: string;
}): Promise<{ ok: boolean; error?: string }> {
  let result = await enqueueLoginVerificationEmail(opts);
  if (result.ok) return result;
  result = await sendTransactional('login-verification', opts.recipient, {
    code: opts.code,
    ip: opts.ip,
    city: opts.city,
    country: opts.country,
    device: opts.device,
  }, opts.idempotencyKey);
  return result;
}
