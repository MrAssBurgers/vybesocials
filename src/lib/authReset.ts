import { supabase } from '@/integrations/supabase/client';

export function getPasswordResetRedirectUrl(): string {
  if (typeof window === 'undefined') return 'https://vybehub.app/reset-password';
  const { origin } = window.location;
  if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
    return `${origin}/reset-password`;
  }
  return 'https://vybehub.app/reset-password';
}

/** Branded Resend email when configured; falls back to Supabase Auth email. */
export async function requestPasswordReset(email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  const redirectTo = getPasswordResetRedirectUrl();

  try {
    const { data, error } = await supabase.functions.invoke('send-reset-email', {
      body: { email: normalized },
    });
    if (!error && data?.success !== false) return;
  } catch (err) {
    console.warn('[authReset] send-reset-email unavailable, using Supabase auth fallback:', err);
  }

  const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalized, {
    redirectTo,
  });
  if (resetError) throw resetError;
}
