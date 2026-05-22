/**
 * giphy-search edge function
 *
 * Proxies GIPHY API calls so the API key never reaches the client bundle.
 * Requires a Supabase JWT to prevent anonymous quota abuse.
 *
 * POST body:
 *   {
 *     endpoint: 'trending' | 'search',
 *     query?: string,    // required when endpoint='search'
 *     offset?: number,   // pagination
 *     limit?: number,    // 1-50, default 30
 *     rating?: 'g' | 'pg' | 'pg-13' | 'r',
 *   }
 *
 * Response (normalized):
 *   { results: [{ id, title, url, previewUrl, mediumUrl }], next: number }
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GIPHY_BASE_URL = "https://api.giphy.com/v1/gifs";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
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

    const GIPHY_API_KEY = Deno.env.get("GIPHY_API_KEY");
    if (!GIPHY_API_KEY) {
      return new Response(JSON.stringify({ error: "GIPHY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const endpoint = body.endpoint === "search" ? "search" : "trending";
    const limit = Math.max(1, Math.min(50, Number(body.limit) || 30));
    const offset = Math.max(0, Math.min(5000, Number(body.offset) || 0));
    const ratingRaw = typeof body.rating === "string" ? body.rating.toLowerCase() : "pg-13";
    const rating = ["g", "pg", "pg-13", "r"].includes(ratingRaw) ? ratingRaw : "pg-13";

    const params = new URLSearchParams({
      api_key: GIPHY_API_KEY,
      limit: String(limit),
      offset: String(offset),
      rating,
      bundle: "messaging_non_clips",
    });
    if (endpoint === "search") {
      const q = typeof body.query === "string" ? body.query.trim() : "";
      if (!q || q.length > 100) {
        return new Response(JSON.stringify({ error: "Invalid query" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      params.set("q", q);
      params.set("lang", "en");
    }

    const upstream = await fetch(`${GIPHY_BASE_URL}/${endpoint}?${params.toString()}`);
    if (!upstream.ok) {
      const txt = await upstream.text();
      console.error("GIPHY API error", upstream.status, txt);
      return new Response(JSON.stringify({ results: [], next: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const data = await upstream.json();
    const items = Array.isArray(data?.data) ? data.data : [];
    const results = items.map((g: any) => {
      const imgs = g.images || {};
      const original = imgs.original?.url || "";
      const fixedHeight = imgs.fixed_height?.url || imgs.fixed_height_small?.url || original;
      const preview = imgs.fixed_height_small?.url || imgs.preview_gif?.url || fixedHeight;
      return {
        id: String(g.id),
        title: g.title || "",
        url: original,
        previewUrl: preview,
        mediumUrl: fixedHeight,
      };
    });
    const pagination = data?.pagination || {};
    const next = Number(pagination.offset || 0) + Number(pagination.count || results.length);

    return new Response(
      JSON.stringify({ results, next }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("giphy-search error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
