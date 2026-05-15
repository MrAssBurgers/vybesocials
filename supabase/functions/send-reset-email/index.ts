import { createClient } from "npm:@supabase/supabase-js@2.90.1";
import { Resend } from "npm:resend@4.1.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function generateResetToken(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(48);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function getRedirectOrigin(value: unknown, req: Request): string {
  const fallback = req.headers.get("origin") || "https://vybehub.app";
  if (typeof value !== "string") return fallback;

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") return fallback;
    return parsed.origin;
  } catch {
    return fallback;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const correlationId = crypto.randomUUID().slice(0, 8);
  const log = (msg: string, data?: unknown) =>
    console.log(`[send-reset-email][${correlationId}] ${msg}`, data ?? "");

  try {
    const body = await req.json();
    const email = (body.email ?? "").trim().toLowerCase();
    const resetOrigin = getRedirectOrigin(body.redirectTo, req);
    log("Incoming request", { email: email ? `${email.slice(0, 3)}***` : "empty" });

    // Always return success to prevent enumeration
    const successResponse = () =>
      new Response(
        JSON.stringify({ success: true, message: "If that email exists, we sent a reset link." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json", "x-correlation-id": correlationId } }
      );

    if (!email || !EMAIL_REGEX.test(email)) {
      log("Invalid email format — returning success to prevent enumeration");
      return successResponse();
    }

    // Rate limit: 3 password reset requests per email per hour
    const { checkRateLimit } = await import("../_shared/rateLimit.ts");
    const { allowed } = await checkRateLimit(`reset:${email}`, 3, 3600);
    if (!allowed) {
      log("Rate limited", { email: email.slice(0, 3) + "***" });
      return successResponse(); // Don't reveal rate limiting to prevent enumeration
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = "VYBE <noreply@vybehub.app>";

    if (!supabaseUrl || !supabaseServiceKey || !resendKey) {
      log("Missing environment variables", {
        supabaseUrl: !!supabaseUrl,
        supabaseServiceKey: !!supabaseServiceKey,
        resendKey: !!resendKey,
      });
      return new Response(
        JSON.stringify({ success: false, error: "Email service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    log("Looking up user for custom reset token");
    const { data: userData, error: userError } = await supabase.auth.admin.listUsers();
    if (userError) throw userError;

    const user = userData.users.find((u) => u.email?.toLowerCase() === email);
    if (!user) {
      log("User not found — returning success to prevent enumeration");
      return successResponse();
    }

    const resetToken = generateResetToken();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    await supabase.from("password_reset_tokens").delete().eq("user_id", user.id);

    const { error: tokenError } = await supabase.from("password_reset_tokens").insert({
      user_id: user.id,
      token: resetToken,
      expires_at: expiresAt,
    });

    if (tokenError) throw tokenError;

    const actionLink = `${resetOrigin}/reset-password?token=${encodeURIComponent(resetToken)}`;
    log("Recovery link generated", { origin: resetOrigin });

    // Send email via Resend
    const resend = new Resend(resendKey);

    const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0a;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);border-radius:24px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">
        <tr><td style="padding:40px 32px 24px;text-align:center;">
          <div style="display:inline-block;padding:12px 20px;background:linear-gradient(135deg,#667eea,#764ba2);border-radius:16px;margin-bottom:20px;">
            <span style="color:#fff;font-size:24px;font-weight:800;letter-spacing:2px;">VYBE</span>
          </div>
          <h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:16px 0 8px;">Reset Your Password</h1>
          <p style="color:#94a3b8;font-size:14px;line-height:1.6;margin:0;">Click the button below to choose a new password for your VYBE account.</p>
        </td></tr>
        <tr><td style="padding:8px 32px 32px;text-align:center;">
          <a href="${actionLink}" style="display:inline-block;padding:14px 40px;background:linear-gradient(135deg,#667eea,#764ba2);color:#ffffff;text-decoration:none;border-radius:14px;font-size:15px;font-weight:700;letter-spacing:0.5px;">Reset Password</a>
          <p style="color:#64748b;font-size:12px;margin-top:20px;line-height:1.5;">This link expires in 1 hour.<br>If you didn't request this, you can safely ignore this email.</p>
        </td></tr>
        <tr><td style="padding:20px 32px;border-top:1px solid rgba(255,255,255,0.06);text-align:center;">
          <p style="color:#475569;font-size:11px;margin:0;">\u00a9 ${new Date().getFullYear()} VYBE</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();

    const textBody = `Reset Your VYBE Password\n\nClick the link below to choose a new password:\n\n${actionLink}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email.`;

    log("Sending email via Resend", { from: fromEmail, to: email });

    const { data: resendData, error: resendError } = await resend.emails.send({
      from: fromEmail,
      to: [email],
      subject: "Reset Your VYBE Password",
      html: htmlBody,
      text: textBody,
    });

    if (resendError) {
      log("Resend error", { error: JSON.stringify(resendError) });
      // Try fallback sender
      log("Trying fallback sender onboarding@resend.dev");
      const fallback = await resend.emails.send({
        from: "VYBE <onboarding@resend.dev>",
        to: [email],
        subject: "Reset Your VYBE Password",
        html: htmlBody,
        text: textBody,
      });
      if (fallback.error) {
        throw new Error("Email delivery failed: " + JSON.stringify(fallback.error));
      }
      log("Fallback email sent", { id: fallback.data?.id });
    } else {
      log("Email sent successfully", { id: resendData?.id });
    }

    return successResponse();
  } catch (error) {
    log("Unhandled error", { message: String(error), stack: (error as Error)?.stack });
    return new Response(
      JSON.stringify({ success: false, error: "Something went wrong. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json", "x-correlation-id": correlationId } }
    );
  }
});
