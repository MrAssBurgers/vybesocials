import { createClient } from "npm:@supabase/supabase-js@2.90.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CreateRoomRequest {
  type?: "audio" | "video";
  expiryMinutes?: number;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Only allow POST
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user is authenticated
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get Daily API key and domain from secrets
    const dailyApiKey = Deno.env.get("DAILY_API_KEY");
    const dailyDomain = Deno.env.get("DAILY_DOMAIN");

    if (!dailyApiKey) {
      console.error("DAILY_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "DAILY_API_KEY is not configured. Please add it to backend secrets." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!dailyDomain) {
      console.error("DAILY_DOMAIN not configured");
      return new Response(
        JSON.stringify({ error: "DAILY_DOMAIN is not configured. Please add it to backend secrets." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body (optional params)
    let body: CreateRoomRequest = {};
    try {
      const text = await req.text();
      if (text) {
        body = JSON.parse(text);
      }
    } catch {
      // Empty body is fine, use defaults
    }

    const { type = "video", expiryMinutes = 60 } = body;

    // Generate unique room name
    const roomName = `room-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    // Room expires after specified minutes (default 60)
    const expireTime = Math.floor(Date.now() / 1000) + expiryMinutes * 60;

    // Create Daily room via API (public - no token required)
    const dailyResponse = await fetch("https://api.daily.co/v1/rooms", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${dailyApiKey}`,
      },
      body: JSON.stringify({
        name: roomName,
        privacy: "public",
        properties: {
          exp: expireTime,
          start_audio_off: false,
          start_video_off: type === "audio",
          enable_chat: true,
          enable_screenshare: type === "video",
          max_participants: 10,
        },
      }),
    });

    if (!dailyResponse.ok) {
      const errorText = await dailyResponse.text();
      console.error("Daily API error:", errorText);
      return new Response(
        JSON.stringify({ error: "Failed to create room" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const dailyRoom = await dailyResponse.json();

    // Construct room URL using domain
    const roomUrl = `https://${dailyDomain}.daily.co/${roomName}`;

    return new Response(
      JSON.stringify({
        roomUrl,
        roomName,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
