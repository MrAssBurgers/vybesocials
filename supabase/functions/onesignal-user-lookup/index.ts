// Diagnostic-only: looks up a OneSignal user by external_id so the Despia push
// demo can verify whether a real push subscription exists. Requires a logged-in
// caller; never returns secrets.
import { createClient } from "npm:@supabase/supabase-js@2.90.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const onesignalAppId = Deno.env.get("ONESIGNAL_APP_ID");
    const onesignalRestKey = Deno.env.get("ONESIGNAL_REST_API_KEY");

    const authHeader = req.headers.get("Authorization") || "";
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!bearer) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });
    const { data: userData, error: authErr } = await userClient.auth.getUser(bearer);
    if (authErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!onesignalAppId || !onesignalRestKey) {
      return new Response(JSON.stringify({ error: "OneSignal not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { app_id, external_id } = await req.json().catch(() => ({}));
    if (typeof external_id !== "string" || !external_id) {
      return new Response(JSON.stringify({ error: "external_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const appId = typeof app_id === "string" && app_id ? app_id : onesignalAppId;

    const res = await fetch(
      `https://api.onesignal.com/apps/${appId}/users/by/external_id/${encodeURIComponent(external_id)}`,
      { headers: { Authorization: `Key ${onesignalRestKey}`, Accept: "application/json" } },
    );
    const bodyText = await res.text().catch(() => "");
    let user: Record<string, unknown> = {};
    try { user = bodyText ? JSON.parse(bodyText) : {}; } catch { user = {}; }
    if (!res.ok) {
      return new Response(JSON.stringify({
        subscriptions: [], status: res.status, error: bodyText.slice(0, 300),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const subscriptions = Array.isArray((user as { subscriptions?: unknown }).subscriptions)
      ? ((user as { subscriptions: Array<Record<string, unknown>> }).subscriptions).map((s) => ({
          id: s.id, type: s.type, enabled: s.enabled, has_token: Boolean(s.token),
        }))
      : [];
    const identity = (user as { identity?: Record<string, unknown> }).identity || {};
    return new Response(JSON.stringify({
      status: res.status,
      subscriptions,
      onesignal_id: identity.onesignal_id ?? null,
      external_id: identity.external_id ?? external_id,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
