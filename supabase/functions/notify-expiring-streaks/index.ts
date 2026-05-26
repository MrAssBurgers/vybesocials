// Sends a "your streak with X is about to expire" push to the side of each
// active friend streak that has been silent the longest. Runs on a schedule
// (typically every 30 min). Idempotent: marks each streak as notified so the
// same person isn't pinged repeatedly inside one expiry window.

import { createClient } from "npm:@supabase/supabase-js@2.90.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ExpiringRow {
  streak_id: string;
  recipient_profile_id: string;
  other_profile_id: string;
  streak_count: number;
  expires_at: string;
}

function inQuietHours(prefs: any): boolean {
  if (prefs?.dnd_enabled && prefs?.dnd_until && new Date(prefs.dnd_until) > new Date()) return true;
  const start = prefs?.quiet_hours_start as string | null;
  const end = prefs?.quiet_hours_end as string | null;
  if (!start || !end) return false;
  const now = new Date();
  const minsNow = now.getUTCHours() * 60 + now.getUTCMinutes();
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const s = sh * 60 + sm;
  const e = eh * 60 + em;
  if (s < e) return minsNow >= s && minsNow < e;
  return minsNow >= s || minsNow < e;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (token !== serviceKey) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

    // Look at streaks expiring in the next 4 hours where we haven't already
    // pinged the silent side since their friend last messaged.
    const { data: rows, error } = await supabase.rpc("find_expiring_streaks", {
      _horizon_minutes: 240,
    });
    if (error) {
      console.error("[expiring-streaks] rpc failed", error.message);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const expiring = (rows ?? []) as ExpiringRow[];
    if (expiring.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, considered: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Hydrate profile + other-person info in one go.
    const profileIds = Array.from(
      new Set(expiring.flatMap((r) => [r.recipient_profile_id, r.other_profile_id])),
    );
    const { data: profileRows } = await supabase
      .from("profiles")
      .select("id, user_id, username, display_name, avatar_url")
      .in("id", profileIds);
    const profileMap = new Map((profileRows ?? []).map((p: any) => [p.id, p]));

    // Pull notification prefs in bulk (recipient profile.id → user_id → prefs)
    const recipientAuthIds = Array.from(
      new Set(
        expiring
          .map((r) => profileMap.get(r.recipient_profile_id)?.user_id as string | undefined)
          .filter(Boolean) as string[],
      ),
    );
    const { data: prefsRows } = await supabase
      .from("notification_preferences")
      .select("user_id, friend_activity_enabled, quiet_hours_start, quiet_hours_end, dnd_enabled, dnd_until")
      .in("user_id", recipientAuthIds);
    const prefsMap = new Map((prefsRows ?? []).map((p: any) => [p.user_id, p]));

    let sent = 0;
    for (const row of expiring) {
      try {
        const recipient = profileMap.get(row.recipient_profile_id);
        const other = profileMap.get(row.other_profile_id);
        if (!recipient?.user_id || !other) continue;

        // Respect prefs — friend_activity opt-in is the closest existing toggle.
        // Default to ON when the row is missing (parity with other dispatchers).
        const prefs = prefsMap.get(recipient.user_id);
        if (prefs && prefs.friend_activity_enabled === false) continue;
        if (inQuietHours(prefs)) continue;

        const minsLeft = Math.max(
          5,
          Math.round((new Date(row.expires_at).getTime() - Date.now()) / 60000),
        );
        const hoursLeft = Math.round(minsLeft / 60);
        const timeLabel = hoursLeft >= 1
          ? `${hoursLeft}h`
          : `${minsLeft}m`;

        const name = other.display_name || other.username || "your friend";
        const title = `🔥 ${row.streak_count}-day streak with ${name}`;
        const body = `Don't break it — send a message in the next ${timeLabel}.`;
        const deepLink = `/messages?with=${other.username || row.other_profile_id}`;

        // Dedupe via the notifications table (same shape used elsewhere)
        const { data: dup } = await supabase
          .from("notifications")
          .select("id")
          .eq("user_id", row.recipient_profile_id)
          .eq("type", "streak_expiring")
          .contains("meta", { streak_id: row.streak_id })
          .gte("created_at", new Date(Date.now() - 12 * 3600_000).toISOString())
          .maybeSingle();
        if (dup) continue;

        const { error: nErr } = await supabase.from("notifications").insert({
          user_id: row.recipient_profile_id,
          actor_id: row.other_profile_id,
          type: "streak_expiring",
          title,
          body,
          deep_link: deepLink,
          meta: {
            streak_id: row.streak_id,
            streak_count: row.streak_count,
            expires_at: row.expires_at,
          },
        });
        if (nErr) {
          console.warn("[expiring-streaks] notification insert failed", nErr.message);
        }

        await supabase.functions.invoke("send-push-notification", {
          body: {
            userId: recipient.user_id,
            title,
            body,
            url: deepLink,
            tag: `streak-expiring-${row.streak_id}`,
            type: "streak_expiring",
            data: { streak_id: row.streak_id, streak_count: row.streak_count },
          },
        });

        await supabase
          .from("streaks")
          .update({ expiring_notice_sent_at: new Date().toISOString() })
          .eq("id", row.streak_id);

        sent++;
      } catch (e) {
        console.warn("[expiring-streaks] row error", e);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, sent, considered: expiring.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[expiring-streaks] fatal", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
