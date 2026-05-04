// Smart Ping Dispatcher — runs on a schedule, sends contextual nearby/friend pings
import { createClient } from "npm:@supabase/supabase-js@2.90.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MILES_TO_METERS = 1609.34;

function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
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

async function generateCopy(title: string, hint: string, LOVABLE_API_KEY: string): Promise<string> {
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content:
              "Write ONE short push notification body, max 90 chars, friendly, action-oriented, max 1 emoji. Plain text only, no quotes.",
          },
          { role: "user", content: `${title}\n\nContext: ${hint}` },
        ],
      }),
    });
    if (!res.ok) return hint.slice(0, 90);
    const json = await res.json();
    const txt: string = json.choices?.[0]?.message?.content?.trim() || hint;
    return txt.replace(/^["']|["']$/g, "").slice(0, 110);
  } catch {
    return hint.slice(0, 90);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") || "";

    // Pull users with smart pings enabled + recent location
    const { data: candidates } = await supabase
      .from("notification_preferences")
      .select(
        "user_id, nearby_enabled, friend_activity_enabled, trending_local_enabled, smart_ping_radius_miles, smart_ping_max_per_day, quiet_hours_start, quiet_hours_end, dnd_enabled, dnd_until",
      )
      .or("nearby_enabled.eq.true,friend_activity_enabled.eq.true,trending_local_enabled.eq.true");

    if (!candidates || candidates.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let sent = 0;

    for (const prefs of candidates) {
      try {
        if (inQuietHours(prefs)) continue;

        // Daily cap check
        const { data: countData } = await supabase.rpc("count_smart_pings_today", {
          _user_id: prefs.user_id,
        });
        const today = (countData as number) ?? 0;
        if (today >= (prefs.smart_ping_max_per_day ?? 6)) continue;

        // Get user location (must be recent — within 6h)
        const { data: loc } = await supabase
          .from("user_locations")
          .select("latitude, longitude, updated_at")
          .eq("user_id", prefs.user_id)
          .maybeSingle();
        if (!loc) continue;
        const ageHrs = (Date.now() - new Date(loc.updated_at).getTime()) / 3600_000;
        if (ageHrs > 6) continue;

        const radius = prefs.smart_ping_radius_miles ?? 5;

        // Candidate posts in last 45 min
        const since = new Date(Date.now() - 45 * 60_000).toISOString();
        const { data: recentPosts } = await supabase
          .from("posts")
          .select("id, author_id, caption, thumbnail_url, media_url, view_count, created_at")
          .gte("created_at", since)
          .neq("author_id", prefs.user_id)
          .order("view_count", { ascending: false })
          .limit(50);
        if (!recentPosts || recentPosts.length === 0) continue;

        // Filter by author location proximity
        const authorIds = [...new Set(recentPosts.map((p) => p.author_id))];
        const { data: authorLocs } = await supabase
          .from("user_locations")
          .select("user_id, latitude, longitude")
          .in("user_id", authorIds);
        const locMap = new Map(
          (authorLocs || []).map((l) => [l.user_id, { lat: l.latitude, lng: l.longitude }]),
        );

        const nearby = recentPosts
          .map((p) => {
            const al = locMap.get(p.author_id);
            if (!al) return null;
            const dist = haversineMiles(loc.latitude, loc.longitude, al.lat, al.lng);
            return dist <= radius ? { ...p, _dist: dist } : null;
          })
          .filter(Boolean) as any[];
        if (nearby.length === 0) continue;

        // Pick top by view_count + recency
        const top = nearby.sort((a, b) => b.view_count - a.view_count)[0];

        // Dedupe: skip if we already pinged this post in last 6h
        const sixHoursAgo = new Date(Date.now() - 6 * 3600_000).toISOString();
        const { data: dup } = await supabase
          .from("notifications")
          .select("id")
          .eq("user_id", prefs.user_id)
          .eq("type", "smart_ping")
          .gte("created_at", sixHoursAgo)
          .contains("meta", { post_id: top.id })
          .maybeSingle();
        if (dup) continue;

        // Friend check for subtype
        const { data: friendRec } = await supabase
          .from("friend_requests")
          .select("id")
          .or(
            `and(sender_id.eq.${prefs.user_id},receiver_id.eq.${top.author_id}),and(sender_id.eq.${top.author_id},receiver_id.eq.${prefs.user_id})`,
          )
          .eq("status", "accepted")
          .maybeSingle();

        const isFriend = !!friendRec;
        const subtype = isFriend ? "friend_activity" : "nearby_post";

        if (subtype === "friend_activity" && !prefs.friend_activity_enabled) continue;
        if (subtype === "nearby_post" && !prefs.nearby_enabled) continue;

        // Get author profile for copy
        const { data: author } = await supabase
          .from("profiles")
          .select("username, display_name")
          .eq("id", top.author_id)
          .maybeSingle();
        const name = author?.display_name || author?.username || "Someone";

        const distLabel = top._dist < 0.2 ? "right near you" : `${top._dist.toFixed(1)} mi away`;
        const captionSnippet = (top.caption || "").slice(0, 80);
        const hint = isFriend
          ? `${name} just posted ${distLabel}: ${captionSnippet}`
          : `${name} posted ${distLabel}: ${captionSnippet}`;
        const title = isFriend ? `👀 ${name} just posted` : `📍 Happening near you`;
        const body = await generateCopy(title, hint, LOVABLE_API_KEY);

        const deepLink = `/p/${top.id}`;
        const image = top.thumbnail_url || top.media_url || null;

        // Insert notification row (actor = author)
        const { error: insertErr } = await supabase.from("notifications").insert({
          user_id: prefs.user_id,
          actor_id: top.author_id,
          type: "smart_ping",
          subtype,
          title,
          body,
          image_url: image,
          deep_link: deepLink,
          post_id: top.id,
          meta: { post_id: top.id, distance_miles: Number(top._dist.toFixed(2)) },
        });
        if (insertErr) {
          console.warn("[smart-ping] insert failed", insertErr.message);
          continue;
        }

        // Send push (we need auth user_id; profile.user_id)
        const { data: profile } = await supabase
          .from("profiles")
          .select("user_id")
          .eq("id", prefs.user_id)
          .maybeSingle();
        if (profile?.user_id) {
          await supabase.functions.invoke("send-push-notification", {
            body: {
              userId: profile.user_id,
              title,
              body,
              url: deepLink,
              tag: `smart-${subtype}-${top.id}`,
              type: "smart_ping",
              data: { image_url: image, subtype, post_id: top.id },
            },
          });
        }
        sent++;
      } catch (e) {
        console.warn("[smart-ping] user error", e);
      }
    }

    return new Response(JSON.stringify({ ok: true, sent, considered: candidates.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[smart-ping] fatal", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
