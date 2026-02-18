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

  // Track which steps completed for response
  const steps = {
    redemptionCreated: false,
    rewardGranted: false,
    notificationSent: false,
  };

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header", steps }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Create client with user's auth to verify identity
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      console.error("[confirm-referral] auth error:", authError);
      return new Response(
        JSON.stringify({ error: "User not authenticated", steps }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request - use distinct names to avoid SQL column conflicts
    const body = await req.json();
    const theInviterUserId = body.inviterUserId;
    const theInviterProfileId = body.inviterProfileId;
    
    if (!theInviterUserId || !theInviterProfileId) {
      return new Response(
        JSON.stringify({ error: "Missing inviter data", steps }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[confirm-referral] Processing:", { 
      redeemerAuthId: user.id, 
      theInviterUserId, 
      theInviterProfileId 
    });

    // Use service role for all operations (bypasses RLS)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Get redeemer's profile including referral_inviter_id to enforce one-invite rule
    const { data: redeemerProfile, error: redeemerError } = await supabaseAdmin
      .from("profiles")
      .select("id, username, referral_inviter_id")
      .eq("user_id", user.id)
      .single();

    if (redeemerError || !redeemerProfile) {
      console.error("[confirm-referral] redeemer profile error:", redeemerError);
      return new Response(
        JSON.stringify({ error: "Could not find your profile", steps }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const redeemerProfileId = redeemerProfile.id;

    // CRITICAL: One-invite-per-user rule
    // If user already has a referral_inviter_id set, treat as success but don't re-process
    if (redeemerProfile.referral_inviter_id) {
      console.log("[confirm-referral] User already accepted a referral, skipping:", redeemerProfile.referral_inviter_id);
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
      return new Response(
        JSON.stringify({ error: "Cannot refer yourself", steps }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if already redeemed via invite_redemptions (backup check)
    const { data: existingRedemption } = await supabaseAdmin
      .from("invite_redemptions")
      .select("id")
      .eq("redeemer_id", user.id)
      .maybeSingle();

    if (existingRedemption) {
      console.log("[confirm-referral] Already redeemed via invite_redemptions");
      // Still set referral_inviter_id if not set (migration backfill)
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

    const { data: existingInvite } = await supabaseAdmin
      .from("invites")
      .select("id, use_count")
      .eq("inviter_id", theInviterUserId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingInvite) {
      inviteId = existingInvite.id;
      currentUseCount = existingInvite.use_count || 0;
    } else {
      // Create invite record if none exists
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
        console.error("[confirm-referral] Failed to create invite:", createError);
        return new Response(
          JSON.stringify({ error: "Failed to process referral", steps }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      inviteId = newInvite.id;
    }

    // Create redemption record (redeemer_id is the auth user id)
    const { error: redemptionError } = await supabaseAdmin
      .from("invite_redemptions")
      .insert({
        invite_id: inviteId,
        redeemer_id: user.id,
      });

    if (redemptionError && redemptionError.code !== "23505") {
      console.error("[confirm-referral] Redemption error:", redemptionError);
      return new Response(
        JSON.stringify({ error: "Failed to record redemption", steps }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // CRITICAL: Set referral_inviter_id on the profile (one-time, immutable)
    const { error: setInviterError } = await supabaseAdmin
      .from("profiles")
      .update({ referral_inviter_id: theInviterProfileId })
      .eq("id", redeemerProfileId)
      .is("referral_inviter_id", null); // Only set if not already set

    if (setInviterError) {
      console.error("[confirm-referral] Failed to set referral_inviter_id:", setInviterError);
      // Continue anyway - the redemption is recorded
    } else {
      console.log("[confirm-referral] Set referral_inviter_id:", theInviterProfileId);
    }

    steps.redemptionCreated = true;
    console.log("[confirm-referral] Step 1 complete: Redemption created & inviter set");

    // ========== STEP 2: Grant reward (increment use_count + badges) ==========
    const newUseCount = currentUseCount + 1;
    const { error: updateError } = await supabaseAdmin
      .from("invites")
      .update({ use_count: newUseCount })
      .eq("id", inviteId);

    if (updateError) {
      console.error("[confirm-referral] Failed to update use_count:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to grant reward", steps }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[confirm-referral] Updated use_count to:", newUseCount);

    // Award badges based on milestones
    const milestones = [
      { count: 1, type: "invite_1", name: "First Invite" },
      { count: 3, type: "invite_3", name: "Rising Star" },
      { count: 10, type: "invite_10", name: "Early Builder" },
    ];

    for (const milestone of milestones) {
      if (newUseCount >= milestone.count) {
        const { error: badgeError } = await supabaseAdmin
          .from("user_badges")
          .upsert({
            user_id: theInviterUserId,
            badge_type: milestone.type,
            badge_name: milestone.name,
            metadata: { milestone: milestone.count },
          }, {
            onConflict: "user_id,badge_type",
            ignoreDuplicates: true,
          });

        if (badgeError) {
          console.log("[confirm-referral] Badge upsert note:", badgeError.message);
        } else {
          console.log("[confirm-referral] Awarded badge:", milestone.name);
        }
      }
    }

    // Grant XP to inviter (500 XP per successful referral)
    try {
      await supabaseAdmin.rpc("add_user_xp", { 
        p_user_id: theInviterProfileId, 
        p_xp_amount: 500 
      });
      console.log("[confirm-referral] Granted 500 XP to inviter");
    } catch (xpErr) {
      console.error("[confirm-referral] Failed to grant inviter XP:", xpErr);
    }

    // Grant XP to invitee (250 XP welcome bonus for joining via referral)
    try {
      await supabaseAdmin.rpc("add_user_xp", { 
        p_user_id: redeemerProfileId, 
        p_xp_amount: 250 
      });
      console.log("[confirm-referral] Granted 250 XP to invitee");
    } catch (xpErr) {
      console.error("[confirm-referral] Failed to grant invitee XP:", xpErr);
    }

    steps.rewardGranted = true;
    console.log("[confirm-referral] Step 2 complete: Reward granted with XP");

    // ========== STEP 3: Create friendship & send notification ==========
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
      }
    } else {
      await supabaseAdmin
        .from("friend_requests")
        .insert({
          sender_id: redeemerProfileId,
          receiver_id: theInviterProfileId,
          status: "accepted",
        });
      console.log("[confirm-referral] Created instant friendship");
    }

    // Send notification to inviter
    const { error: notifError } = await supabaseAdmin
      .from("notifications")
      .insert({
        user_id: theInviterProfileId,
        actor_id: redeemerProfileId,
        type: "invite_accepted",
      });

    if (notifError) {
      console.error("[confirm-referral] Notification error:", notifError);
      // Don't fail the whole flow for notification error
    }

    steps.notificationSent = true;
    console.log("[confirm-referral] Step 3 complete: Notification sent");

    console.log("[confirm-referral] All steps complete!");

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
    console.error("[confirm-referral] unexpected error:", error);
    return new Response(
      JSON.stringify({ error: message, steps }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
