import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Confirm Referral Edge Function
 * 
 * Called when new user clicks "Thank You" on referral popup.
 * Uses service role to atomically:
 * 1. Create invite_redemption record
 * 2. Increment inviter's use_count
 * 3. Award badges based on milestones
 * 4. Create instant friendship
 * 5. Send notification to inviter
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
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
        JSON.stringify({ error: "User not authenticated" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request
    const { inviterUserId, inviterProfileId } = await req.json();
    
    if (!inviterUserId || !inviterProfileId) {
      return new Response(
        JSON.stringify({ error: "Missing inviter data" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[confirm-referral] Processing:", { 
      redeemerAuthId: user.id, 
      inviterUserId, 
      inviterProfileId 
    });

    // Use service role for all operations (bypasses RLS)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Get redeemer's profile
    const { data: redeemerProfile, error: redeemerError } = await supabaseAdmin
      .from("profiles")
      .select("id, username")
      .eq("user_id", user.id)
      .single();

    if (redeemerError || !redeemerProfile) {
      console.error("[confirm-referral] redeemer profile error:", redeemerError);
      return new Response(
        JSON.stringify({ error: "Could not find your profile" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const redeemerProfileId = redeemerProfile.id;

    // Prevent self-referral
    if (redeemerProfileId === inviterProfileId) {
      return new Response(
        JSON.stringify({ error: "Cannot refer yourself" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if already redeemed
    const { data: existingRedemption } = await supabaseAdmin
      .from("invite_redemptions")
      .select("id")
      .eq("redeemer_id", redeemerProfileId)
      .maybeSingle();

    if (existingRedemption) {
      console.log("[confirm-referral] Already redeemed");
      return new Response(
        JSON.stringify({ success: true, message: "Already confirmed" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find or create invite record for inviter
    let inviteId: string;
    let currentUseCount = 0;

    const { data: existingInvite } = await supabaseAdmin
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
      // Create invite record if none exists
      const inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase();
      const { data: newInvite, error: createError } = await supabaseAdmin
        .from("invites")
        .insert({
          inviter_id: inviterUserId,
          invite_code: inviteCode,
          use_count: 0,
        })
        .select("id, use_count")
        .single();

      if (createError || !newInvite) {
        console.error("[confirm-referral] Failed to create invite:", createError);
        return new Response(
          JSON.stringify({ error: "Failed to process referral" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      inviteId = newInvite.id;
    }

    // Create redemption record
    const { error: redemptionError } = await supabaseAdmin
      .from("invite_redemptions")
      .insert({
        invite_id: inviteId,
        redeemer_id: redeemerProfileId,
      });

    if (redemptionError && redemptionError.code !== "23505") {
      console.error("[confirm-referral] Redemption error:", redemptionError);
      return new Response(
        JSON.stringify({ error: "Failed to record redemption" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Increment use_count
    const newUseCount = currentUseCount + 1;
    await supabaseAdmin
      .from("invites")
      .update({ use_count: newUseCount })
      .eq("id", inviteId);

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
            user_id: inviterUserId,
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

    // Create instant friendship
    const { data: existingFriendship } = await supabaseAdmin
      .from("friend_requests")
      .select("id, status")
      .or(`and(sender_id.eq.${redeemerProfileId},receiver_id.eq.${inviterProfileId}),and(sender_id.eq.${inviterProfileId},receiver_id.eq.${redeemerProfileId})`)
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
          receiver_id: inviterProfileId,
          status: "accepted",
        });
      console.log("[confirm-referral] Created instant friendship");
    }

    // Send notification to inviter
    await supabaseAdmin
      .from("notifications")
      .insert({
        user_id: inviterProfileId,
        actor_id: redeemerProfileId,
        type: "invite_accepted",
      });

    console.log("[confirm-referral] Success! Inviter rewarded.");

    return new Response(
      JSON.stringify({ 
        success: true, 
        newUseCount,
        message: "Referral confirmed successfully" 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("[confirm-referral] unexpected error:", error);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
