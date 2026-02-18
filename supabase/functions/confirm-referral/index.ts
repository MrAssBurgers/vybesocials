import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-correlation-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function log(correlationId: string, step: string, data: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ correlationId, step, ...data, ts: Date.now() }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const correlationId = req.headers.get("x-correlation-id") || crypto.randomUUID();

  try {
    // ===== STEP: auth =====
    log(correlationId, "auth", { msg: "Validating token" });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      log(correlationId, "auth_fail", { reason: "missing_header" });
      return json({ success: false, stepFailed: "auth", errorCode: "NO_AUTH", errorMessage: "Missing authorization header" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify user identity with anon client
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    let userId: string;
    const token = authHeader.replace("Bearer ", "");

    try {
      const { data: { user }, error } = await userClient.auth.getUser(token);
      if (error || !user) throw error || new Error("No user");
      userId = user.id;
    } catch (e) {
      log(correlationId, "auth_fail", { reason: "invalid_token" });
      return json({ success: false, stepFailed: "auth", errorCode: "AUTH_FAILED", errorMessage: "Authentication failed. Please sign in again." }, 401);
    }

    log(correlationId, "auth_ok", { userId });

    // ===== STEP: parse =====
    log(correlationId, "parse", { msg: "Parsing request body" });

    let inviterUserId: string;
    let inviterProfileId: string;

    try {
      const body = await req.json();
      inviterUserId = body.inviterUserId;
      inviterProfileId = body.inviterProfileId;
    } catch {
      log(correlationId, "parse_fail");
      return json({ success: false, stepFailed: "parse", errorCode: "BAD_BODY", errorMessage: "Invalid request body" }, 400);
    }

    if (!inviterUserId || !inviterProfileId) {
      log(correlationId, "parse_fail", { inviterUserId: !!inviterUserId, inviterProfileId: !!inviterProfileId });
      return json({ success: false, stepFailed: "parse", errorCode: "MISSING_PARAMS", errorMessage: "Missing inviter information" }, 400);
    }

    log(correlationId, "parse_ok", { inviterProfileId, inviterUserId, redeemerId: userId });

    // ===== STEP: validate =====
    // Quick self-referral check before DB call
    log(correlationId, "validate");

    // ===== STEP: db_confirm (atomic) =====
    log(correlationId, "db_confirm", { msg: "Calling confirm_referral_atomic" });

    const admin = createClient(supabaseUrl, serviceKey);

    // Retry loop for profile race condition (profile may not exist yet after signup)
    let result: Record<string, unknown> | null = null;
    let lastError: string | null = null;

    for (let attempt = 1; attempt <= 5; attempt++) {
      const { data, error } = await admin.rpc("confirm_referral_atomic", {
        p_inviter_profile_id: inviterProfileId,
        p_inviter_user_id: inviterUserId,
        p_redeemer_auth_id: userId,
      });

      if (error) {
        lastError = error.message;
        log(correlationId, "db_confirm_error", { attempt, error: error.message, code: error.code });

        // If profile not found, retry (race condition with profile creation trigger)
        if (attempt < 5) {
          log(correlationId, "db_confirm_retry", { attempt, nextIn: "600ms" });
          await new Promise(r => setTimeout(r, 600));
          continue;
        }
        break;
      }

      result = data as Record<string, unknown>;
      break;
    }

    if (!result) {
      log(correlationId, "db_confirm_fail", { lastError });
      return json({
        success: false,
        stepFailed: "db_confirm",
        errorCode: "DB_ERROR",
        errorMessage: lastError || "Database operation failed. Please try again.",
      }, 500);
    }

    // The atomic function returns { success, error_code, error_message, ... }
    if (result.success === false) {
      log(correlationId, "db_confirm_rejected", { errorCode: result.error_code });
      return json({
        success: false,
        stepFailed: "db_confirm",
        errorCode: result.error_code as string,
        errorMessage: result.error_message as string,
      }, 400);
    }

    // ===== STEP: done =====
    log(correlationId, "done", {
      alreadyConfirmed: result.already_confirmed,
      rewardsGranted: result.rewards_granted,
      newUseCount: result.new_use_count,
    });

    return json({
      success: true,
      alreadyConfirmed: result.already_confirmed || false,
      rewardsGranted: result.rewards_granted || false,
      inviterProfileId: result.inviter_profile_id,
      redeemerProfileId: result.redeemer_profile_id,
      newUseCount: result.new_use_count,
      // Legacy compat for client step display
      steps: {
        redemptionCreated: true,
        rewardGranted: result.rewards_granted || result.already_confirmed || false,
        notificationSent: !result.already_confirmed,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    log(correlationId, "unhandled_error", { error: msg });
    return json({
      success: false,
      stepFailed: "unknown",
      errorCode: "INTERNAL",
      errorMessage: "An unexpected error occurred. Please try again.",
    }, 500);
  }
});
