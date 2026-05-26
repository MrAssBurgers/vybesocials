// get-ranked-feed
// Returns a personalized, ranked feed for the authenticated user.
// Thin wrapper around the get_ranked_feed RPC — that RPC merges the stored
// ranking_score with a per-viewer personal_match boost and applies the
// diversity-per-creator cap.
//
// Body: { content_type?, category?, lat?, lng?, radius_miles?, offset?, limit? }
import { createClient } from "npm:@supabase/supabase-js@2.90.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve profile id (post tables key off profiles.id, not auth.uid())
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: profile } = await admin
      .from("profiles").select("id").eq("user_id", user.id).maybeSingle();
    if (!profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const params = {
      p_user_id: profile.id,
      p_content_type: body.content_type ?? null,
      p_category: body.category ?? null,
      p_lat: typeof body.lat === "number" ? body.lat : null,
      p_lng: typeof body.lng === "number" ? body.lng : null,
      p_radius_miles: typeof body.radius_miles === "number" ? body.radius_miles : null,
      p_offset: Math.max(0, Number(body.offset ?? 0)),
      p_limit: Math.min(50, Math.max(1, Number(body.limit ?? 20))),
    };

    const { data, error } = await admin.rpc("get_ranked_feed", params);
    if (error) throw error;

    return new Response(JSON.stringify({ posts: data ?? [] }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[get-ranked-feed] error", e);
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
