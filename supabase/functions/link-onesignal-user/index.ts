import { createClient } from "npm:@supabase/supabase-js@2.90.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface LinkPayload {
  profileId: string;
  subscriptionId?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const onesignalAppId = Deno.env.get("ONESIGNAL_APP_ID");
    const onesignalRestKey = Deno.env.get("ONESIGNAL_REST_API_KEY");

    const authHeader = req.headers.get("Authorization") || "";
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!bearer) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });
    const { data: userData, error: authErr } = await userClient.auth.getUser(bearer);
    if (authErr || !userData?.user) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { profileId, subscriptionId }: LinkPayload = await req.json();
    if (!profileId || !/^[0-9a-f-]{36}$/i.test(profileId)) {
      return new Response(JSON.stringify({ success: false, error: "profileId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: ownProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    const allowed = ownProfile?.id === profileId || userData.user.id === profileId;
    if (!allowed) {
      return new Response(JSON.stringify({ success: false, error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!onesignalAppId || !onesignalRestKey) {
      return new Response(JSON.stringify({ success: false, error: "OneSignal not configured" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: Record<string, unknown> = {
      identity: { external_id: profileId },
    };
    if (subscriptionId && subscriptionId.length >= 8 && !subscriptionId.startsWith("despia:")) {
      body.subscriptions = [{ id: subscriptionId, enabled: true }];
    }

    const res = await fetch(`https://api.onesignal.com/apps/${onesignalAppId}/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Key ${onesignalRestKey}`,
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    const json = await res.json().catch(() => null);
    const linked = res.ok;

    if (subscriptionId && linked) {
      await supabase.from("push_tokens").upsert({
        user_id: profileId,
        platform: "despia",
        token: subscriptionId,
      }, { onConflict: "user_id,platform" });
    }

    return new Response(
      JSON.stringify({ success: linked, onesignal: { status: res.status, body: json } }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
