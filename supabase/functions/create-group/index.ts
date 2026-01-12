import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // Create client with user's auth to get their identity
    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get authenticated user
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      console.error("[create-group] auth error:", authError);
      return new Response(
        JSON.stringify({ error: "User not authenticated" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const body = await req.json();
    const { name, memberIds } = body;

    console.log("[create-group] request:", { name, memberIds, userId: user.id });

    // Validate name
    const cleanName = (name || "").trim();
    if (!cleanName) {
      return new Response(
        JSON.stringify({ error: "Group name is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate memberIds
    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      return new Response(
        JSON.stringify({ error: "At least one member is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role client to call the RPC function
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Get creator's profile ID
    const { data: creatorProfile, error: creatorError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (creatorError || !creatorProfile) {
      console.error("[create-group] creator profile error:", creatorError);
      return new Response(
        JSON.stringify({ error: "Could not find your profile" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[create-group] creator profile:", creatorProfile.id);

    // Filter out creator from memberIds (if present) and ensure valid UUIDs
    const cleanMemberIds = memberIds
      .filter((id: string) => id && typeof id === "string" && id !== creatorProfile.id)
      .map((id: string) => id.trim());

    if (cleanMemberIds.length === 0) {
      return new Response(
        JSON.stringify({ error: "At least one other member is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[create-group] calling create_group_chat with:", {
      name: cleanName,
      creator: creatorProfile.id,
      members: cleanMemberIds,
    });

    // Call the atomic RPC function
    const { data: result, error: rpcError } = await supabaseAdmin.rpc("create_group_chat", {
      p_name: cleanName,
      p_creator_profile_id: creatorProfile.id,
      p_member_profile_ids: cleanMemberIds,
    });

    if (rpcError) {
      console.error("[create-group] RPC error:", rpcError);
      return new Response(
        JSON.stringify({ 
          error: rpcError.message || "Failed to create group",
          code: rpcError.code,
          details: rpcError.details,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[create-group] success:", result);

    const groupData = result?.[0];
    if (!groupData?.group_id) {
      return new Response(
        JSON.stringify({ error: "Group creation returned no data" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ 
        id: groupData.group_id, 
        name: groupData.group_name,
        success: true 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("[create-group] unexpected error:", error);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
