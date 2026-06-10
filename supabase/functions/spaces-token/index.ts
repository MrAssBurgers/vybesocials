/**
 * Spaces Token Edge Function
 *
 * Mints LiveKit access tokens for VYBE Spaces (live audio rooms).
 * Role-aware: hosts/co-hosts/speakers can publish audio, listeners are
 * subscribe-only. Identity = auth user id (matches space_participants.user_id).
 */

import { createClient } from "npm:@supabase/supabase-js@2.90.1";
import { AccessToken, RoomServiceClient } from "npm:livekit-server-sdk@2.15.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SPEAKER_ROLES = ["host", "co_host", "speaker"];

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

    const body = await req.json() as {
      spaceId?: string;
      serverId?: string;
      channelId?: string;
    };

    const livekitApiKey = Deno.env.get("LIVEKIT_API_KEY");
    const livekitApiSecret = Deno.env.get("LIVEKIT_API_SECRET");
    const livekitUrl = Deno.env.get("LIVEKIT_URL");
    if (!livekitApiKey || !livekitApiSecret || !livekitUrl) {
      console.error("LiveKit secrets not configured");
      return jsonResponse({ error: "Service not configured" }, 500);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, username, display_name")
      .eq("user_id", user.id)
      .maybeSingle();
    const displayName = profile?.display_name || profile?.username || "Member";

    // ── Community voice channel (persistent LiveKit lounges) ──
    if (body.serverId && body.channelId) {
      const { serverId, channelId } = body;
      if (typeof serverId !== "string" || typeof channelId !== "string") {
        return jsonResponse({ error: "Invalid serverId or channelId" }, 400);
      }

      if (!profile?.id) {
        return jsonResponse({ error: "Profile not found" }, 404);
      }

      const { data: membership } = await supabase
        .from("server_members")
        .select("role")
        .eq("server_id", serverId)
        .eq("user_id", profile.id)
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
        identity: profile.id,
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
        canPublish: true,
        role: "speaker",
      });
    }

    const { spaceId } = body;
    if (!spaceId || typeof spaceId !== "string") {
      return jsonResponse({ error: "spaceId or (serverId + channelId) required" }, 400);
    }

    // Space must exist and be live
    const { data: space } = await supabase
      .from("spaces")
      .select("id, status, title")
      .eq("id", spaceId)
      .single();

    if (!space) {
      return jsonResponse({ error: "Space not found" }, 404);
    }
    if (space.status !== "live") {
      return jsonResponse({ error: "Space is not live" }, 409);
    }

    // Caller must be an active participant; role decides publish rights
    const { data: participant } = await supabase
      .from("space_participants")
      .select("role")
      .eq("space_id", spaceId)
      .eq("user_id", user.id)
      .is("left_at", null)
      .single();

    if (!participant) {
      return jsonResponse({ error: "Join the space before requesting audio" }, 403);
    }

    const canPublish = SPEAKER_ROLES.includes(participant.role);

    const roomName = `space-${spaceId}`;

    // Pre-create room so it survives brief empty moments (host reconnects)
    try {
      const httpUrl = livekitUrl.replace(/^wss?:/, (m) => (m === "wss:" ? "https:" : "http:"));
      const svc = new RoomServiceClient(httpUrl, livekitApiKey, livekitApiSecret);
      await svc.createRoom({
        name: roomName,
        emptyTimeout: 300,
        maxParticipants: 200,
      });
    } catch (e) {
      console.log("createRoom skipped:", (e as Error)?.message);
    }

    const at = new AccessToken(livekitApiKey, livekitApiSecret, {
      identity: user.id,
      name: displayName,
      ttl: "4h",
    });

    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish,
      canSubscribe: true,
      canPublishData: false,
    });

    return jsonResponse({
      token: await at.toJwt(),
      url: livekitUrl,
      roomName,
      canPublish,
      role: participant.role,
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
