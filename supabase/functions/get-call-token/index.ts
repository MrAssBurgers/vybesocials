import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GetTokenRequest {
  roomName: string;
  callId: string;
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

    // Get user's profile ID
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, username, display_name")
      .eq("user_id", user.id)
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse and validate request body
    const body: GetTokenRequest = await req.json();
    const { roomName, callId } = body;

    if (!roomName || typeof roomName !== "string") {
      return new Response(JSON.stringify({ error: "roomName required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!callId || typeof callId !== "string") {
      return new Response(JSON.stringify({ error: "callId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the call exists and user is caller or receiver
    const { data: call, error: callError } = await supabase
      .from("calls")
      .select("id, room_name, room_url, caller_id, receiver_id, conversation_id, status")
      .eq("id", callId)
      .single();

    if (callError || !call) {
      return new Response(JSON.stringify({ error: "Call not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check user is participant
    const isParticipant = call.caller_id === profile.id || call.receiver_id === profile.id;
    
    // Also check conversation membership for group calls
    if (!isParticipant) {
      const { data: membership } = await supabase
        .from("conversation_members")
        .select("id")
        .eq("conversation_id", call.conversation_id)
        .eq("user_id", profile.id)
        .single();

      if (!membership) {
        return new Response(JSON.stringify({ error: "Not authorized to join this call" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Verify room name matches
    if (call.room_name !== roomName) {
      return new Response(JSON.stringify({ error: "Room name mismatch" }), {
        status: 400,
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

    // Token expires in 10 minutes
    const expireTime = Math.floor(Date.now() / 1000) + 10 * 60;

    // Generate Daily meeting token
    const tokenResponse = await fetch("https://api.daily.co/v1/meeting-tokens", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${dailyApiKey}`,
      },
      body: JSON.stringify({
        properties: {
          room_name: roomName,
          exp: expireTime,
          user_id: profile.id,
          user_name: profile.display_name || profile.username,
          // Allow join + control own audio/video
          enable_screenshare: true,
          start_audio_off: false,
          start_video_off: false,
        },
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("Daily API token error:", errorText);
      return new Response(JSON.stringify({ error: "Failed to generate meeting token" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tokenData = await tokenResponse.json();
    const token = tokenData.token;

    if (!token) {
      return new Response(JSON.stringify({ error: "No token returned from Daily" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        roomUrl: call.room_url,
        roomName: call.room_name,
        token,
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
