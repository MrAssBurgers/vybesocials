/**
 * tenor-search edge function
 *
 * Proxies Tenor (Google) GIF API calls so the API key never reaches the
 * client bundle. Requires a Supabase JWT to prevent anonymous quota abuse.
 *
 * POST body:
 *   {
 *     endpoint: 'featured' | 'search',
 *     query?: string,    // required when endpoint='search'
 *     pos?: string,      // pagination cursor
 *     limit?: number,    // 1-50, default 30
 *   }
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TENOR_BASE_URL = "https://tenor.googleapis.com/v2";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Require auth — prevents anonymous quota burn.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: u, error: ue } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (ue || !u?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const TENOR_API_KEY = Deno.env.get("TENOR_API_KEY");
    if (!TENOR_API_KEY) {
      return new Response(JSON.stringify({ error: "Tenor not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const endpoint = body.endpoint === "search" ? "search" : "featured";
    const limit = Math.max(1, Math.min(50, Number(body.limit) || 30));
    const params = new URLSearchParams({
      key: TENOR_API_KEY,
      client_key: "vybe_chat",
      limit: String(limit),
      media_filter: "tinygif,gif,mediumgif",
    });
    if (endpoint === "search") {
      const q = typeof body.query === "string" ? body.query.trim() : "";
      if (!q || q.length > 100) {
        return new Response(JSON.stringify({ error: "Invalid query" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      params.set("q", q);
    }
    if (typeof body.pos === "string" && body.pos.length <= 256) {
      params.set("pos", body.pos);
    }

    const upstream = await fetch(`${TENOR_BASE_URL}/${endpoint}?${params.toString()}`);
    if (!upstream.ok) {
      const txt = await upstream.text();
      console.error("Tenor API error", upstream.status, txt);
      return new Response(JSON.stringify({ results: [], next: "" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const data = await upstream.json();
    return new Response(
      JSON.stringify({ results: data.results || [], next: data.next || "" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("tenor-search error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
