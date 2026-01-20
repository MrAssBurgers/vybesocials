import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TENOR_API_KEY = Deno.env.get("TENOR_API_KEY");
const TENOR_BASE_URL = "https://tenor.googleapis.com/v2";

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!TENOR_API_KEY) {
      console.error("TENOR_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "GIF service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { query, pos, limit = 30 } = await req.json();

    // Determine endpoint based on whether we have a search query
    const endpoint = query?.trim() 
      ? `${TENOR_BASE_URL}/search` 
      : `${TENOR_BASE_URL}/featured`;

    const params = new URLSearchParams({
      key: TENOR_API_KEY,
      client_key: "vybe_chat",
      limit: String(limit),
      media_filter: "tinygif,gif",
    });

    if (query?.trim()) {
      params.set("q", query);
    }

    if (pos) {
      params.set("pos", pos);
    }

    const response = await fetch(`${endpoint}?${params.toString()}`);
    
    if (!response.ok) {
      console.error("Tenor API error:", response.status, await response.text());
      return new Response(
        JSON.stringify({ error: "Failed to fetch GIFs" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();

    return new Response(
      JSON.stringify({
        results: data.results || [],
        next: data.next || "",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("GIF search error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
