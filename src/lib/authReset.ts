import { supabase } from '@/integrations/supabase/client';
import { getPasswordResetRedirectUrl } from '@/lib/authRedirect';
import { parseEdgeInvokeResult } from '@/lib/edgeFunctionResponse';

/** Branded Resend email when configured; always falls back to Supabase Auth email. */
export async function requestPasswordReset(email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  const redirectTo = getPasswordResetRedirectUrl();

  // Primary path — works without RESEND_API_KEY or edge deploy.
  const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalized, {
    redirectTo,
  });

  // #region agent log
  fetch('http://127.0.0.1:7261/ingest/50637484-d3e0-47cb-9fea-f484edc6e98d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d7bed4'},body:JSON.stringify({sessionId:'d7bed4',location:'authReset.ts:resetPasswordForEmail',message:'password reset request',data:{ok:!resetError,errorCode:(resetError as {code?:string})?.code??null,errorMsg:resetError?.message??null,redirectTo},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
  // #endregion

  if (resetError) throw resetError;

  // Optional branded email — ignore when edge secrets missing (common on hprmic).
  try {
    const result = await supabase.functions.invoke('send-reset-email', {
      body: { email: normalized },
    });
    const { payload } = await parseEdgeInvokeResult(result);
    // #region agent log
    fetch('http://127.0.0.1:7261/ingest/50637484-d3e0-47cb-9fea-f484edc6e98d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d7bed4'},body:JSON.stringify({sessionId:'d7bed4',location:'authReset.ts:send-reset-email',message:'branded reset email attempt',data:{success:payload?.success===true,configured:payload?.success===true},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
    // #endregion
  } catch {
    /* Supabase auth email already sent */
  }
}
