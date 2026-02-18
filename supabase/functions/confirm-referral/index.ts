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
  // CORS preflight — always safe
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const correlationId = req.headers.get("x-correlation-id") || crypto.randomUUID();

  try {
    // ── STEP 1: Auth ──
    log(correlationId, "auth_start");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      log(correlationId, "auth_fail", { reason: "missing_header" });
      return json({ success: false, step: "auth", errorCode: "NO_AUTH", error: "Missing authorization header" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !serviceKey || !anonKey) {
      log(correlationId, "env_fail", {
        hasUrl: !!supabaseUrl,
        hasServiceKey: !!serviceKey,
        hasAnonKey: !!anonKey,
      });
      return json({ success: false, step: "env", errorCode: "MISSING_ENV", error: "Server misconfigured — missing environment variables" }, 500);
    }

    // Verify user identity
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    let userId: string;

    try {
      const { data: { user }, error } = await userClient.auth.getUser(token);
      if (error || !user) throw error || new Error("No user returned");
      userId = user.id;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log(correlationId, "auth_fail", { reason: "invalid_token", detail: msg });
      return json({ success: false, step: "auth", errorCode: "AUTH_FAILED", error: "Authentication failed. Please sign in again." }, 401);
    }

    log(correlationId, "auth_ok", { userId });

    // ── STEP 2: Parse body ──
    log(correlationId, "parse_start");

    let inviterUserId: string;
    let inviterProfileId: string;

    try {
      const body = await req.json();
      inviterUserId = body.inviterUserId;
      inviterProfileId = body.inviterProfileId;

      log(correlationId, "parse_body", {
        inviterUserId: inviterUserId || "(missing)",
        inviterProfileId: inviterProfileId || "(missing)",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log(correlationId, "parse_fail", { detail: msg });
      return json({ success: false, step: "parse", errorCode: "BAD_BODY", error: "Invalid request body: " + msg }, 400);
    }

    if (!inviterUserId || !inviterProfileId) {
      log(correlationId, "parse_missing", { hasUserId: !!inviterUserId, hasProfileId: !!inviterProfileId });
      return json({ success: false, step: "parse", errorCode: "MISSING_PARAMS", error: "Missing inviterUserId or inviterProfileId" }, 400);
    }

    log(correlationId, "parse_ok", { inviterProfileId, inviterUserId, redeemerId: userId });

    // ── STEP 3: Call atomic DB function ──
    log(correlationId, "db_call_start");

    const admin = createClient(supabaseUrl, serviceKey);

    let result: Record<string, unknown> | null = null;
    let lastError: string | null = null;
    let lastCode: string | null = null;

    for (let attempt = 1; attempt <= 5; attempt++) {
      log(correlationId, "db_attempt", { attempt });

      try {
        const { data, error } = await admin.rpc("confirm_referral_atomic", {
          p_inviter_profile_id: inviterProfileId,
          p_inviter_user_id: inviterUserId,
          p_redeemer_auth_id: userId,
        });

        if (error) {
          lastError = error.message;
          lastCode = error.code || "UNKNOWN";
          log(correlationId, "db_rpc_error", { attempt, error: error.message, code: error.code, hint: error.hint || null });

          // Retry on profile-not-found race condition
          if (attempt < 5 && (error.message?.includes("PROFILE_NOT_FOUND") || error.code === "PGRST116")) {
            log(correlationId, "db_retry_wait", { attempt, reason: "profile_race", nextMs: 600 });
            await new Promise(r => setTimeout(r, 600));
            continue;
          }
          // Don't retry other errors — break immediately
          break;
        }

        result = data as Record<string, unknown>;
        log(correlationId, "db_rpc_ok", { attempt, result });
        break;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        lastError = msg;
        lastCode = "EXCEPTION";
        log(correlationId, "db_exception", { attempt, error: msg });
        break; // Don't retry on unexpected exceptions
      }
    }

    if (!result) {
      log(correlationId, "db_final_fail", { lastError, lastCode });
      return json({
        success: false,
        step: "db_confirm",
        errorCode: lastCode || "DB_ERROR",
        error: lastError || "Database operation failed after retries",
      }, 500);
    }

    // DB function returns { success: false, error_code, error_message } on business logic rejection
    if (result.success === false) {
      log(correlationId, "db_rejected", { errorCode: result.error_code, errorMessage: result.error_message });
      return json({
        success: false,
        step: "db_confirm",
        errorCode: (result.error_code as string) || "REJECTED",
        error: (result.error_message as string) || "Referral rejected by database",
      }, 400);
    }

    // ── STEP 4: Success ──
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
      steps: {
        redemptionCreated: true,
        rewardGranted: result.rewards_granted || result.already_confirmed || false,
        notificationSent: !result.already_confirmed,
      },
    });
  } catch (error: unknown) {
    // ── GLOBAL CATCH — NEVER THROW ──
    const msg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    log(correlationId, "unhandled_error", { error: msg, stack: stack?.slice(0, 500) });
    return json({
      success: false,
      step: "unknown",
      errorCode: "INTERNAL",
      error: "Unexpected server error: " + msg,
    }, 500);
  }
});
