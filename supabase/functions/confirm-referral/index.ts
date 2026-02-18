import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const steps = { redemptionCreated: false, rewardGranted: false, notificationSent: false };

  try {
    // --- Auth ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Missing authorization header", steps }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify user identity
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    let userId: string;
    const token = authHeader.replace("Bearer ", "");

    try {
      const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
      if (claimsErr || !claimsData?.claims?.sub) throw claimsErr;
      userId = claimsData.claims.sub as string;
    } catch {
      const { data: { user }, error: authErr } = await userClient.auth.getUser();
      if (authErr || !user) return json({ error: "User not authenticated", steps }, 401);
      userId = user.id;
    }

    console.log("[confirm-referral] authed:", userId);

    // --- Parse body ---
    const { inviterUserId, inviterProfileId } = await req.json();
    if (!inviterUserId || !inviterProfileId) {
      return json({ error: "Missing inviterUserId or inviterProfileId", steps }, 400);
    }

    // --- Admin client (service role, bypasses RLS) ---
    const admin = createClient(supabaseUrl, serviceKey);

    // --- Get redeemer profile (with retry for race condition) ---
    let redeemerProfile: { id: string; username: string; referral_inviter_id: string | null } | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, error } = await admin
        .from("profiles")
        .select("id, username, referral_inviter_id")
        .eq("user_id", userId)
        .maybeSingle();

      if (data) { redeemerProfile = data; break; }
      if (attempt < 4) {
        console.log(`[confirm-referral] Profile not found, retry ${attempt + 1}/5`);
        await new Promise(r => setTimeout(r, 600));
      } else {
        console.error("[confirm-referral] Profile never appeared for", userId, error);
      }
    }

    if (!redeemerProfile) {
      return json({ error: "Your profile hasn't been created yet. Please try again in a moment.", steps }, 400);
    }

    const redeemerProfileId = redeemerProfile.id;
    console.log("[confirm-referral] redeemer:", redeemerProfileId, redeemerProfile.username);

    // --- Idempotency: already accepted a referral ---
    if (redeemerProfile.referral_inviter_id) {
      console.log("[confirm-referral] Already referred by:", redeemerProfile.referral_inviter_id);
      return json({
        success: true,
        message: "Already confirmed",
        alreadyReferred: true,
        steps: { redemptionCreated: true, rewardGranted: true, notificationSent: true },
      });
    }

    // --- Self-referral guard ---
    if (redeemerProfileId === inviterProfileId) {
      return json({ error: "Cannot refer yourself", steps }, 400);
    }

    // --- Idempotency: existing redemption ---
    const { data: existingRedemption } = await admin
      .from("invite_redemptions")
      .select("id")
      .eq("redeemer_id", userId)
      .maybeSingle();

    if (existingRedemption) {
      // Backfill referral_inviter_id if missing
      await admin.from("profiles").update({ referral_inviter_id: inviterProfileId })
        .eq("id", redeemerProfileId).is("referral_inviter_id", null);
      return json({
        success: true,
        message: "Already confirmed",
        steps: { redemptionCreated: true, rewardGranted: true, notificationSent: true },
      });
    }

    // ========== STEP 1: Find/create invite, create redemption ==========
    let inviteId: string;
    let currentUseCount = 0;

    const { data: existingInvite } = await admin
      .from("invites")
      .select("id, use_count")
      .eq("inviter_id", inviterUserId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingInvite) {
      inviteId = existingInvite.id;
      currentUseCount = existingInvite.use_count || 0;
    } else {
      const code = Math.random().toString(36).substring(2, 10).toUpperCase();
      const { data: newInvite, error: createErr } = await admin
        .from("invites")
        .insert({ inviter_id: inviterUserId, invite_code: code, use_count: 0 })
        .select("id")
        .single();
      if (createErr || !newInvite) {
        return json({ error: "Failed to create invite record", steps }, 500);
      }
      inviteId = newInvite.id;
    }

    // Insert redemption (plain insert, handle duplicate gracefully)
    const { error: redemptionErr } = await admin
      .from("invite_redemptions")
      .insert({ invite_id: inviteId, redeemer_id: userId });

    if (redemptionErr && redemptionErr.code !== "23505") {
      console.error("[confirm-referral] Redemption error:", redemptionErr);
      return json({ error: "Failed to record redemption", steps }, 500);
    }

    // Set referral_inviter_id
    await admin.from("profiles").update({ referral_inviter_id: inviterProfileId })
      .eq("id", redeemerProfileId).is("referral_inviter_id", null);

    steps.redemptionCreated = true;

    // ========== STEP 2: Rewards ==========
    const newUseCount = currentUseCount + 1;
    await admin.from("invites").update({ use_count: newUseCount }).eq("id", inviteId);

    // Badges (best-effort)
    const milestones = [
      { count: 1, type: "invite_1", name: "First Invite" },
      { count: 3, type: "invite_3", name: "Rising Star" },
      { count: 10, type: "invite_10", name: "Early Builder" },
    ];
    for (const m of milestones) {
      if (newUseCount >= m.count) {
        try {
          const { data: badge } = await admin.from("badges").select("id").eq("name", m.name).maybeSingle();
          if (badge) {
            await admin.from("user_badges").upsert(
              { user_id: inviterUserId, badge_id: badge.id, badge_type: m.type, badge_name: m.name, metadata: { milestone: m.count } },
              { onConflict: "user_id,badge_id", ignoreDuplicates: true }
            );
          }
        } catch { /* non-fatal */ }
      }
    }

    // XP (best-effort)
    try { await admin.rpc("add_user_xp", { p_user_id: inviterProfileId, p_xp_amount: 500 }); } catch {}
    try { await admin.rpc("add_user_xp", { p_user_id: redeemerProfileId, p_xp_amount: 250 }); } catch {}

    steps.rewardGranted = true;

    // ========== STEP 3: Friendship & notification ==========
    try {
      const { data: existingFriendship } = await admin
        .from("friend_requests")
        .select("id, status")
        .or(`and(sender_id.eq.${redeemerProfileId},receiver_id.eq.${inviterProfileId}),and(sender_id.eq.${inviterProfileId},receiver_id.eq.${redeemerProfileId})`)
        .maybeSingle();

      if (existingFriendship) {
        if (existingFriendship.status === "pending") {
          await admin.from("friend_requests").update({ status: "accepted" }).eq("id", existingFriendship.id);
        }
      } else {
        await admin.from("friend_requests").insert({
          sender_id: redeemerProfileId, receiver_id: inviterProfileId, status: "accepted",
        });
      }
    } catch (e) { console.error("[confirm-referral] Friendship error:", e); }

    try {
      await admin.from("notifications").insert({
        user_id: inviterProfileId, actor_id: redeemerProfileId, type: "invite_accepted",
      });
    } catch (e) { console.error("[confirm-referral] Notification error:", e); }

    steps.notificationSent = true;
    console.log("[confirm-referral] ✅ Complete");

    return json({ success: true, newUseCount, message: "Referral confirmed successfully", steps });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    console.error("[confirm-referral] ❌", error);
    return json({ error: msg, steps }, 500);
  }
});
