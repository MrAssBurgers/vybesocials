import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CreateRoomRequest {
  type: "audio" | "video";
  conversationId: string;
  participants: string[];
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Only allow POST
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Initialize Supabase client with user's auth
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user's profile ID - with ensure fallback
    let profile: { id: string } | null = null;
    let profileError: any = null;
    
    // First attempt: get existing profile
    const { data: existingProfile, error: lookupError } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!lookupError && existingProfile) {
      profile = existingProfile;
    } else {
      // Profile not found - try to ensure it exists via RPC
      console.log("Profile not found, attempting to create via ensure_profile...");
      const { data: ensuredId, error: ensureError } = await supabase.rpc("ensure_profile");
      
      if (ensureError) {
        console.error("ensure_profile failed:", ensureError);
        profileError = ensureError;
      } else if (ensuredId) {
        profile = { id: ensuredId as string };
      }
    }

    if (!profile) {
      console.error("Failed to get/create profile:", profileError);
      return new Response(JSON.stringify({ error: "Profile not found - please refresh and try again" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse and validate request body
    const body: CreateRoomRequest = await req.json();
    const { type, conversationId, participants } = body;

    if (!type || !["audio", "video"].includes(type)) {
      return new Response(JSON.stringify({ error: "Invalid call type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!conversationId) {
      return new Response(JSON.stringify({ error: "conversationId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!participants || !Array.isArray(participants) || participants.length === 0) {
      return new Response(JSON.stringify({ error: "participants required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify user is member of conversation
    const { data: membership, error: memberError } = await supabase
      .from("conversation_members")
      .select("id")
      .eq("conversation_id", conversationId)
      .eq("user_id", profile.id)
      .single();

    if (memberError || !membership) {
      return new Response(JSON.stringify({ error: "Not a member of this conversation" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get Daily API key from secrets
    const dailyApiKey = Deno.env.get("DAILY_API_KEY");
    if (!dailyApiKey) {
      console.error("DAILY_API_KEY not configured");
      return new Response(JSON.stringify({ error: "Service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate unique room name
    const roomName = `call-${conversationId.slice(0, 8)}-${Date.now()}`;

    // Room expires in 4 hours
    const expireTime = Math.floor(Date.now() / 1000) + 4 * 60 * 60;

    // Create Daily room with CRYSTAL CLEAR HD settings for FaceTime-like experience
    const dailyResponse = await fetch("https://api.daily.co/v1/rooms", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${dailyApiKey}`,
      },
      body: JSON.stringify({
        name: roomName,
        privacy: "private",
        properties: {
          exp: expireTime,
          // Always allow audio to start ON by default
          start_audio_off: false,
          // Audio calls should start with video OFF
          start_video_off: type === "audio",
          enable_chat: true,
          enable_screenshare: type === "video",
          max_participants: Math.max(participants.length + 1, 10),
          // CRYSTAL CLEAR HD VIDEO SETTINGS
          enable_advanced_chat: false,
          enable_network_ui: false,
          enable_prejoin_ui: false,
          // Switch to SFU with 2+ participants for better quality routing
          sfu_switchover: 2,
          // Keep quality high for small calls (no optimization that reduces quality)
          experimental_optimize_large_calls: false,
        },
      }),
    });

    if (!dailyResponse.ok) {
      const errorText = await dailyResponse.text();
      console.error("Daily API error:", errorText);
      return new Response(JSON.stringify({ error: "Failed to create room" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dailyRoom = await dailyResponse.json();
    const roomUrl = dailyRoom.url;

    // Determine receiver_id (first participant that isn't the caller)
    const receiverId = participants.find((p) => p !== profile.id) || participants[0];

    // Create call session record
    const { data: callSession, error: callError } = await supabase
      .from("calls")
      .insert({
        conversation_id: conversationId,
        caller_id: profile.id,
        receiver_id: receiverId,
        call_type: type,
        status: "ringing",
        room_url: roomUrl,
        room_name: roomName,
        is_group_call: participants.length > 1,
        max_participants: participants.length + 1,
      })
      .select()
      .single();

    if (callError) {
      console.error("Failed to create call session:", callError);
      return new Response(JSON.stringify({ error: "Failed to create call session" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        roomUrl,
        roomName,
        callId: callSession.id,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
