/**
 * Community Voice Token — LiveKit tokens for Discord-style voice channels.
 * Room: community-{serverId}-{channelId}. Requires server membership.
 */

import { createClient } from "npm:@supabase/supabase-js@2.90.1";
import { AccessToken, RoomServiceClient } from "npm:livekit-server-sdk@2.15.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return jsonResponse({ error: "Invalid token" }, 401);
    }

    const { serverId, channelId } = await req.json() as { serverId?: string; channelId?: string };
    if (!serverId || !channelId) {
      return jsonResponse({ error: "serverId and channelId required" }, 400);
    }

    const { data: profileRow } = await supabase
      .from("profiles")
      .select("id, username, display_name")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profileRow?.id) {
      return jsonResponse({ error: "Profile not found" }, 404);
    }

    const { data: membership } = await supabase
      .from("server_members")
      .select("role")
      .eq("server_id", serverId)
      .eq("user_id", profileRow.id)
      .maybeSingle();

    if (!membership) {
      return jsonResponse({ error: "Not a member of this community" }, 403);
    }

    const { data: channel } = await supabase
      .from("channels")
      .select("id, type, server_id")
      .eq("id", channelId)
      .eq("server_id", serverId)
      .maybeSingle();

    if (!channel) {
      return jsonResponse({ error: "Channel not found" }, 404);
    }
    if (channel.type !== "voice") {
      return jsonResponse({ error: "Not a voice channel" }, 400);
    }

    const livekitApiKey = Deno.env.get("LIVEKIT_API_KEY");
    const livekitApiSecret = Deno.env.get("LIVEKIT_API_SECRET");
    const livekitUrl = Deno.env.get("LIVEKIT_URL");
    if (!livekitApiKey || !livekitApiSecret || !livekitUrl) {
      console.error("LiveKit secrets not configured");
      return jsonResponse({ error: "Service not configured" }, 500);
    }

    const displayName = profileRow.display_name || profileRow.username || "Member";

    const roomName = `community-${serverId}-${channelId}`;

    try {
      const httpUrl = livekitUrl.replace(/^wss?:/, (m) => (m === "wss:" ? "https:" : "http:"));
      const svc = new RoomServiceClient(httpUrl, livekitApiKey, livekitApiSecret);
      await svc.createRoom({
        name: roomName,
        emptyTimeout: 300,
        maxParticipants: 100,
      });
    } catch (e) {
      console.log("createRoom skipped:", (e as Error)?.message);
    }

    const at = new AccessToken(livekitApiKey, livekitApiSecret, {
      identity: profileRow.id,
      name: displayName,
      ttl: "4h",
    });

    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    return jsonResponse({
      token: await at.toJwt(),
      url: livekitUrl,
      roomName,
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
