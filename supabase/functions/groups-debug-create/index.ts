import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Only allow POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // TEMP DEBUG ENDPOINT: ignore frontend input
  let rawBody: unknown = null;
  try {
    rawBody = await req.json();
  } catch {
    rawBody = null;
  }

  console.log("[groups-debug-create] request body:", rawBody);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.log("[groups-debug-create] missing Authorization header");
      return new Response(JSON.stringify({ error: "User not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Validate user session using the provided JWT
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    console.log("[groups-debug-create] auth.getUser error:", userError);
    console.log("[groups-debug-create] authenticated user:", user);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "User not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service client for DB writes (bypass RLS, atomic RPC)
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: creatorProfile, error: creatorProfileError } = await admin
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    console.log("[groups-debug-create] creator profile:", creatorProfile);
    console.log("[groups-debug-create] creator profile error:", creatorProfileError);

    if (creatorProfileError || !creatorProfile?.id) {
      return new Response(
        JSON.stringify({
          error: creatorProfileError?.message || "Creator profile not found",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { data: otherProfile, error: otherProfileError } = await admin
      .from("profiles")
      .select("id")
      .neq("id", creatorProfile.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    console.log("[groups-debug-create] other profile:", otherProfile);
    console.log("[groups-debug-create] other profile error:", otherProfileError);

    if (otherProfileError) {
      return new Response(JSON.stringify({ error: otherProfileError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!otherProfile?.id) {
      return new Response(
        JSON.stringify({ error: "No other users exist to add" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log("[groups-debug-create] using member profile id:", otherProfile.id);

    const { data: rpcData, error: rpcError } = await admin.rpc(
      "create_group_chat",
      {
        p_name: "Debug Group",
        p_creator_profile_id: creatorProfile.id,
        p_member_profile_ids: [otherProfile.id],
      },
    );

    console.log("[groups-debug-create] create_group_chat result:", rpcData);
    console.log("[groups-debug-create] create_group_chat error:", rpcError);

    if (rpcError) {
      return new Response(
        JSON.stringify({
          error: rpcError.message,
          code: rpcError.code,
          details: rpcError.details,
          hint: rpcError.hint,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const firstRow = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    const groupId = firstRow?.group_id;

    if (!groupId) {
      return new Response(
        JSON.stringify({ error: "Group created but groupId missing from response" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({
        groupId,
        groupName: firstRow?.group_name ?? "Debug Group",
        message: "Debug group created",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("[groups-debug-create] unexpected error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
