import { createClient } from "npm:@supabase/supabase-js@2.90.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Confirm Referral Edge Function
 * 
 * Called when new user clicks "Thank You" on referral popup.
 * Returns step-by-step progress for event-driven UI.
 * 
 * Steps:
 * 1. Validate & create redemption record (25% → 50%)
 * 2. Grant reward / increment use_count (50% → 75%)
 * 3. Create friendship & send notification (75% → 100%)
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const steps = {
    redemptionCreated: false,
    rewardGranted: false,
    notificationSent: false,
  };

  try {
    // ========== AUTH: Use getClaims() for signing-keys compatibility ==========
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.error("[confirm-referral] Missing or malformed Authorization header");
      return new Response(
        JSON.stringify({ error: "Missing authorization header", steps }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Create user-scoped client for auth verification
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Use getClaims() - compatible with signing-keys system
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token);
    
    let userId: string;
    
    if (claimsError || !claimsData?.claims?.sub) {
      // Fallback to getUser() in case getClaims isn't available
      console.log("[confirm-referral] getClaims failed, trying getUser fallback:", claimsError?.message);
      const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
      if (authError || !user) {
        console.error("[confirm-referral] Both auth methods failed. getClaims:", claimsError?.message, "getUser:", authError?.message);
        return new Response(
          JSON.stringify({ error: "User not authenticated", steps }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      userId = user.id;
      console.log("[confirm-referral] Authenticated via getUser fallback:", userId);
    } else {
      userId = claimsData.claims.sub as string;
      console.log("[confirm-referral] Authenticated via getClaims:", userId);
    }

    // Parse request
    const body = await req.json();
    const theInviterUserId = body.inviterUserId;
    const theInviterProfileId = body.inviterProfileId;
    
    console.log("[confirm-referral] Request body:", JSON.stringify(body));
    
    if (!theInviterUserId || !theInviterProfileId) {
      console.error("[confirm-referral] Missing inviter data in request body");
      return new Response(
        JSON.stringify({ error: "Missing inviter data", steps }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[confirm-referral] Processing:", { 
      redeemerAuthId: userId, 
      theInviterUserId, 
      theInviterProfileId 
    });

    // Use service role for all DB operations (bypasses RLS)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Get redeemer's profile
    const { data: redeemerProfile, error: redeemerError } = await supabaseAdmin
      .from("profiles")
      .select("id, username, referral_inviter_id")
      .eq("user_id", userId)
      .single();

    if (redeemerError || !redeemerProfile) {
      console.error("[confirm-referral] Redeemer profile not found for auth id:", userId, "error:", redeemerError);
      return new Response(
        JSON.stringify({ error: "Could not find your profile", steps }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const redeemerProfileId = redeemerProfile.id;
    console.log("[confirm-referral] Redeemer profile found:", redeemerProfileId, redeemerProfile.username);

    // One-invite-per-user rule
    if (redeemerProfile.referral_inviter_id) {
      console.log("[confirm-referral] Already accepted a referral:", redeemerProfile.referral_inviter_id);
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Already accepted a referral",
          alreadyReferred: true,
          steps: { redemptionCreated: true, rewardGranted: true, notificationSent: true }
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Prevent self-referral
    if (redeemerProfileId === theInviterProfileId) {
      console.log("[confirm-referral] Self-referral blocked");
      return new Response(
        JSON.stringify({ error: "Cannot refer yourself", steps }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check existing redemption
    const { data: existingRedemption } = await supabaseAdmin
      .from("invite_redemptions")
      .select("id")
      .eq("redeemer_id", userId)
      .maybeSingle();

    if (existingRedemption) {
      console.log("[confirm-referral] Already redeemed, backfilling referral_inviter_id");
      await supabaseAdmin
        .from("profiles")
        .update({ referral_inviter_id: theInviterProfileId })
        .eq("id", redeemerProfileId)
        .is("referral_inviter_id", null);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Already confirmed",
          steps: { redemptionCreated: true, rewardGranted: true, notificationSent: true }
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========== STEP 1: Create redemption record ==========
    let inviteId: string;
    let currentUseCount = 0;

    const { data: existingInvite, error: inviteQueryError } = await supabaseAdmin
      .from("invites")
      .select("id, use_count")
      .eq("inviter_id", theInviterUserId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (inviteQueryError) {
      console.error("[confirm-referral] Error querying invites:", inviteQueryError);
    }

    if (existingInvite) {
      inviteId = existingInvite.id;
      currentUseCount = existingInvite.use_count || 0;
      console.log("[confirm-referral] Found existing invite:", inviteId, "use_count:", currentUseCount);
    } else {
      const inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase();
      const { data: newInvite, error: createError } = await supabaseAdmin
        .from("invites")
        .insert({
          inviter_id: theInviterUserId,
          invite_code: inviteCode,
          use_count: 0,
        })
        .select("id, use_count")
        .single();

      if (createError || !newInvite) {
        console.error("[confirm-referral] Failed to create invite record:", createError);
        return new Response(
          JSON.stringify({ error: "Failed to process referral", steps }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      inviteId = newInvite.id;
      console.log("[confirm-referral] Created new invite record:", inviteId);
    }

    // Create redemption record
    const { error: redemptionError } = await supabaseAdmin
      .from("invite_redemptions")
      .insert({
        invite_id: inviteId,
        redeemer_id: userId,
      });

    if (redemptionError && redemptionError.code !== "23505") {
      console.error("[confirm-referral] Redemption insert error:", JSON.stringify(redemptionError));
      return new Response(
        JSON.stringify({ error: "Failed to record redemption", steps }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Set referral_inviter_id on profile
    const { error: setInviterError } = await supabaseAdmin
      .from("profiles")
      .update({ referral_inviter_id: theInviterProfileId })
      .eq("id", redeemerProfileId)
      .is("referral_inviter_id", null);

    if (setInviterError) {
      console.error("[confirm-referral] Failed to set referral_inviter_id:", JSON.stringify(setInviterError));
    } else {
      console.log("[confirm-referral] Set referral_inviter_id:", theInviterProfileId);
    }

    steps.redemptionCreated = true;
    console.log("[confirm-referral] Step 1 complete: Redemption created");

    // ========== STEP 2: Grant reward ==========
    const newUseCount = currentUseCount + 1;
    const { error: updateError } = await supabaseAdmin
      .from("invites")
      .update({ use_count: newUseCount })
      .eq("id", inviteId);

    if (updateError) {
      console.error("[confirm-referral] Failed to update use_count:", JSON.stringify(updateError));
    } else {
      console.log("[confirm-referral] Updated use_count to:", newUseCount);
    }

    // Award badges (best-effort)
    const milestones = [
      { count: 1, type: "invite_1", name: "First Invite" },
      { count: 3, type: "invite_3", name: "Rising Star" },
      { count: 10, type: "invite_10", name: "Early Builder" },
    ];

    for (const milestone of milestones) {
      if (newUseCount >= milestone.count) {
        try {
          const { data: badge } = await supabaseAdmin
            .from("badges")
            .select("id")
            .eq("name", milestone.name)
            .maybeSingle();

          if (badge) {
            const { error: badgeError } = await supabaseAdmin
              .from("user_badges")
              .upsert({
                user_id: theInviterUserId,
                badge_id: badge.id,
                badge_type: milestone.type,
                badge_name: milestone.name,
                metadata: { milestone: milestone.count },
              }, {
                onConflict: "user_id,badge_id",
                ignoreDuplicates: true,
              });

            if (badgeError) {
              console.log("[confirm-referral] Badge upsert note:", badgeError.message);
            } else {
              console.log("[confirm-referral] Awarded badge:", milestone.name);
            }
          }
        } catch (badgeErr) {
          console.log("[confirm-referral] Badge error (non-fatal):", badgeErr);
        }
      }
    }

    // Grant XP to inviter (500 XP)
    try {
      const { data: xpResult, error: xpError } = await supabaseAdmin.rpc("add_user_xp", { 
        p_user_id: theInviterProfileId, 
        p_xp_amount: 500 
      });
      if (xpError) {
        console.error("[confirm-referral] Inviter XP error:", JSON.stringify(xpError));
      } else {
        console.log("[confirm-referral] Granted 500 XP to inviter, result:", JSON.stringify(xpResult));
      }
    } catch (xpErr) {
      console.error("[confirm-referral] Inviter XP exception:", xpErr);
    }

    // Grant XP to invitee (250 XP)
    try {
      const { data: xpResult, error: xpError } = await supabaseAdmin.rpc("add_user_xp", { 
        p_user_id: redeemerProfileId, 
        p_xp_amount: 250 
      });
      if (xpError) {
        console.error("[confirm-referral] Invitee XP error:", JSON.stringify(xpError));
      } else {
        console.log("[confirm-referral] Granted 250 XP to invitee, result:", JSON.stringify(xpResult));
      }
    } catch (xpErr) {
      console.error("[confirm-referral] Invitee XP exception:", xpErr);
    }

    steps.rewardGranted = true;
    console.log("[confirm-referral] Step 2 complete: Rewards granted");

    // ========== STEP 3: Create friendship & send notification ==========
    try {
      const { data: existingFriendship } = await supabaseAdmin
        .from("friend_requests")
        .select("id, status")
        .or(`and(sender_id.eq.${redeemerProfileId},receiver_id.eq.${theInviterProfileId}),and(sender_id.eq.${theInviterProfileId},receiver_id.eq.${redeemerProfileId})`)
        .maybeSingle();

      if (existingFriendship) {
        if (existingFriendship.status === "pending") {
          await supabaseAdmin
            .from("friend_requests")
            .update({ status: "accepted" })
            .eq("id", existingFriendship.id);
          console.log("[confirm-referral] Accepted existing friend request");
        } else {
          console.log("[confirm-referral] Friendship already exists with status:", existingFriendship.status);
        }
      } else {
        const { error: friendError } = await supabaseAdmin
          .from("friend_requests")
          .insert({
            sender_id: redeemerProfileId,
            receiver_id: theInviterProfileId,
            status: "accepted",
          });
        if (friendError) {
          console.error("[confirm-referral] Friend request error:", JSON.stringify(friendError));
        } else {
          console.log("[confirm-referral] Created instant friendship");
        }
      }
    } catch (friendErr) {
      console.error("[confirm-referral] Friendship exception:", friendErr);
    }

    // Send notification to inviter
    try {
      const { error: notifError } = await supabaseAdmin
        .from("notifications")
        .insert({
          user_id: theInviterProfileId,
          actor_id: redeemerProfileId,
          type: "invite_accepted",
        });

      if (notifError) {
        console.error("[confirm-referral] Notification error:", JSON.stringify(notifError));
      } else {
        console.log("[confirm-referral] Notification sent to inviter");
      }
    } catch (notifErr) {
      console.error("[confirm-referral] Notification exception:", notifErr);
    }

    steps.notificationSent = true;
    console.log("[confirm-referral] Step 3 complete");
    console.log("[confirm-referral] ✅ All steps complete!");

    return new Response(
      JSON.stringify({ 
        success: true, 
        newUseCount,
        message: "Referral confirmed successfully",
        steps,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("[confirm-referral] ❌ Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: message, steps }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
