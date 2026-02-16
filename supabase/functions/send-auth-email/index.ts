import { createClient } from "npm:@supabase/supabase-js@2.90.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function generateToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const arr = new Uint8Array(48);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => chars[b % chars.length]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { action, email, token, newPassword, redirectUrl } = await req.json();

    // ── REQUEST RESET ───────────────────────────────────────────
    if (action === "request_reset") {
      if (!email) {
        return new Response(
          JSON.stringify({ error: "Email is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Find user by email using admin API
      const { data: userData, error: userError } = await supabase.auth.admin.listUsers();
      if (userError) throw userError;

      const user = userData.users.find(
        (u: any) => u.email?.toLowerCase() === email.toLowerCase()
      );

      // Always return success to prevent email enumeration
      if (!user) {
        return new Response(
          JSON.stringify({ success: true, message: "If an account exists, a reset email has been sent." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Generate secure token
      const resetToken = generateToken();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Clean up old tokens for this user
      await supabase
        .from("password_reset_tokens")
        .delete()
        .eq("user_id", user.id);

      // Store token
      const { error: insertError } = await supabase
        .from("password_reset_tokens")
        .insert({
          user_id: user.id,
          token: resetToken,
          expires_at: expiresAt.toISOString(),
        });

      if (insertError) throw insertError;

      // Build reset URL
      const baseUrl = redirectUrl || "https://vybeapp.lovable.app";
      const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;

      // Send email via Resend
      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          // Use your verified domain: "VYBE <noreply@vybehub.app>"
          // Until domain is verified in Resend, use their default:
          from: Deno.env.get("RESEND_FROM_EMAIL") || "VYBE <onboarding@resend.dev>",
          to: [email],
          subject: "Reset Your VYBE Password",
          html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0a;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:480px;background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);border-radius:24px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">
          <!-- Header -->
          <tr>
            <td style="padding:40px 32px 24px;text-align:center;">
              <div style="display:inline-block;padding:12px 20px;background:linear-gradient(135deg,#667eea,#764ba2);border-radius:16px;margin-bottom:20px;">
                <span style="color:#fff;font-size:24px;font-weight:800;letter-spacing:2px;">VYBE</span>
              </div>
              <h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:16px 0 8px;">Reset Your Password</h1>
              <p style="color:#94a3b8;font-size:14px;line-height:1.6;margin:0;">
                We received a request to reset the password for your VYBE account.
              </p>
            </td>
          </tr>
          <!-- Button -->
          <tr>
            <td style="padding:8px 32px 32px;text-align:center;">
              <a href="${resetUrl}" style="display:inline-block;padding:14px 40px;background:linear-gradient(135deg,#667eea,#764ba2);color:#ffffff;text-decoration:none;border-radius:14px;font-size:15px;font-weight:700;letter-spacing:0.5px;">
                Reset Password
              </a>
              <p style="color:#64748b;font-size:12px;margin-top:20px;line-height:1.5;">
                This link expires in 1 hour.<br>
                If you didn't request this, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid rgba(255,255,255,0.06);text-align:center;">
              <p style="color:#475569;font-size:11px;margin:0;">
                © ${new Date().getFullYear()} VYBE · Sent with ❤️
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
          `.trim(),
        }),
      });

      if (!emailRes.ok) {
        const errBody = await emailRes.text();
        console.error("Resend error:", errBody);
        throw new Error("Failed to send email");
      }

      return new Response(
        JSON.stringify({ success: true, message: "If an account exists, a reset email has been sent." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── VERIFY TOKEN & RESET PASSWORD ───────────────────────────
    if (action === "reset_password") {
      if (!token || !newPassword) {
        return new Response(
          JSON.stringify({ error: "Token and new password are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (newPassword.length < 6) {
        return new Response(
          JSON.stringify({ error: "Password must be at least 6 characters" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Look up token
      const { data: tokenData, error: tokenError } = await supabase
        .from("password_reset_tokens")
        .select("*")
        .eq("token", token)
        .is("used_at", null)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (tokenError) throw tokenError;

      if (!tokenData) {
        return new Response(
          JSON.stringify({ error: "Invalid or expired reset link. Please request a new one." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update the user's password via admin API
      const { error: updateError } = await supabase.auth.admin.updateUserById(
        tokenData.user_id,
        { password: newPassword }
      );

      if (updateError) throw updateError;

      // Mark token as used
      await supabase
        .from("password_reset_tokens")
        .update({ used_at: new Date().toISOString() })
        .eq("id", tokenData.id);

      // Clean up expired tokens
      await supabase.rpc("cleanup_expired_reset_tokens");

      return new Response(
        JSON.stringify({ success: true, message: "Password updated successfully" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── SEND VERIFICATION EMAIL ─────────────────────────────────
    if (action === "send_verification") {
      if (!email) {
        return new Response(
          JSON.stringify({ error: "Email is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Generate a magic link via Supabase admin
      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: {
          redirectTo: redirectUrl || "https://vybeapp.lovable.app/home",
        },
      });

      if (linkError) throw linkError;

      const verifyUrl = linkData?.properties?.action_link;
      if (!verifyUrl) throw new Error("Failed to generate verification link");

      // Send via Resend
      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: Deno.env.get("RESEND_FROM_EMAIL") || "VYBE <onboarding@resend.dev>",
          to: [email],
          subject: "Verify Your VYBE Account",
          html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0a;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:480px;background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);border-radius:24px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">
          <tr>
            <td style="padding:40px 32px 24px;text-align:center;">
              <div style="display:inline-block;padding:12px 20px;background:linear-gradient(135deg,#667eea,#764ba2);border-radius:16px;margin-bottom:20px;">
                <span style="color:#fff;font-size:24px;font-weight:800;letter-spacing:2px;">VYBE</span>
              </div>
              <h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:16px 0 8px;">Verify Your Email</h1>
              <p style="color:#94a3b8;font-size:14px;line-height:1.6;margin:0;">
                Welcome to VYBE! Click below to verify your email and get started.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 32px;text-align:center;">
              <a href="${verifyUrl}" style="display:inline-block;padding:14px 40px;background:linear-gradient(135deg,#667eea,#764ba2);color:#ffffff;text-decoration:none;border-radius:14px;font-size:15px;font-weight:700;letter-spacing:0.5px;">
                Verify Email
              </a>
              <p style="color:#64748b;font-size:12px;margin-top:20px;">
                If you didn't create a VYBE account, ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;border-top:1px solid rgba(255,255,255,0.06);text-align:center;">
              <p style="color:#475569;font-size:11px;margin:0;">
                © ${new Date().getFullYear()} VYBE · Sent with ❤️
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
          `.trim(),
        }),
      });

      if (!emailRes.ok) {
        const errBody = await emailRes.text();
        console.error("Resend verification error:", errBody);
        throw new Error("Failed to send verification email");
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Auth email error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
