// Daily Brief push fan-out — sends morning/lunch/dinner pushes via the
// shared `send-push-notification` function (so web AND Despia native tokens
// both get them) and inserts an in-app `notifications` row so the bell shows
// the brief even if OS-level push is blocked.
import { createClient } from "npm:@supabase/supabase-js@2.90.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type BriefTime = "morning" | "lunch" | "dinner";

function getTimeOfDay(hour: number): BriefTime {
  if (hour >= 6 && hour < 11) return "morning";
  if (hour >= 11 && hour < 15) return "lunch";
  return "dinner";
}

function getGreeting(t: BriefTime) {
  return t === "morning"
    ? "☀️ Your morning brief is ready"
    : t === "lunch"
      ? "🍽️ Lunchtime brief is ready"
      : "🌙 Evening brief is ready";
}

function getBody(t: BriefTime) {
  return t === "morning"
    ? "Start your day with personalized updates"
    : t === "lunch"
      ? "Here's what's happening this afternoon"
      : "Wind down with your evening summary";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const hour = new Date().getUTCHours();
    const timeOfDay = getTimeOfDay(hour);
    const title = getGreeting(timeOfDay);
    const body = getBody(timeOfDay);
    const deepLink = `/brief?nTitle=${encodeURIComponent(title)}&nBody=${encodeURIComponent(body)}`;

    console.log(`[brief-push] tod=${timeOfDay} hour=${hour}`);

    // Get all users with at least one push token (any platform)
    const { data: tokens, error: tokenError } = await supabase
      .from("push_tokens")
      .select("user_id, platform");

    if (tokenError) {
      console.error("[brief-push] token error", tokenError);
      throw tokenError;
    }

    const userIds = [...new Set((tokens ?? []).map((t) => t.user_id))];
    if (userIds.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Respect notification preferences (system_enabled and DND/quiet hours)
    const { data: prefs } = await supabase
      .from("notification_preferences")
      .select("user_id, system_enabled, dnd_enabled, dnd_until")
      .in("user_id", userIds);

    const prefByUser = new Map(prefs?.map((p) => [p.user_id, p]) ?? []);
    const now = new Date();

    let pushSent = 0;
    let pushFailed = 0;
    let inAppInserted = 0;

    for (const authUserId of userIds) {
      const p = prefByUser.get(authUserId);
      if (p?.system_enabled === false) continue;
      if (p?.dnd_enabled && p.dnd_until && new Date(p.dnd_until) > now) continue;

      // Map auth user_id -> profiles.id (for notifications.user_id which uses profile id)
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", authUserId)
        .maybeSingle();

      // In-app notification row (bell) keyed by profile.id
      if (profile?.id) {
        const { error: notifErr } = await supabase.from("notifications").insert({
          user_id: profile.id,
          actor_id: profile.id,
          type: "daily_brief",
          subtype: timeOfDay,
          title,
          body,
          deep_link: deepLink,
          meta: { time_of_day: timeOfDay },
        });
        if (!notifErr) inAppInserted++;
        else console.warn("[brief-push] notif insert failed", notifErr.message);
      }

      // Push fan-out via shared function (handles web + Despia native)
      try {
        const { error: pushErr } = await supabase.functions.invoke(
          "send-push-notification",
          {
            body: {
              userId: authUserId,
              title,
              body,
              url: deepLink,
              tag: `vybe-brief-${timeOfDay}`,
              type: "general",
              data: { kind: "daily_brief", time_of_day: timeOfDay },
            },
          },
        );
        if (pushErr) {
          pushFailed++;
          console.warn(`[brief-push] push failed for ${authUserId}`, pushErr.message);
        } else {
          pushSent++;
        }
      } catch (e) {
        pushFailed++;
        console.error(`[brief-push] push error for ${authUserId}`, e);
      }
    }

    console.log(
      `[brief-push] done tod=${timeOfDay} push=${pushSent} push_fail=${pushFailed} inapp=${inAppInserted} users=${userIds.length}`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        timeOfDay,
        users: userIds.length,
        pushSent,
        pushFailed,
        inAppInserted,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[brief-push] fatal", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
