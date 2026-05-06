/**
 * LiveKit Token Edge Function
 * 
 * Generates LiveKit access tokens for authenticated users.
 * Handles both creating new calls and joining existing ones.
 * Replaces both create-call-room and get-call-token.
 */

import { createClient } from "npm:@supabase/supabase-js@2.90.1";
import { AccessToken, RoomServiceClient } from "npm:livekit-server-sdk@2.15.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TokenRequest {
  conversationId: string;
  callType: "audio" | "video";
  receiverId?: string;        // Required when creating a new call
  isGroupCall?: boolean;
  participantIds?: string[];   // For group calls
  callId?: string;             // If joining an existing call
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get profile
    let profileData: { id: string; username: string; display_name: string | null } | null = null;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, username, display_name")
      .eq("user_id", user.id)
      .single();

    if (profileError || !profile) {
      // Try ensure_profile
      const { data: ensuredId, error: ensureError } = await supabase.rpc("ensure_profile");
      if (ensureError || !ensuredId) {
        return new Response(JSON.stringify({ error: "Profile not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Re-fetch
      const { data: p2 } = await supabase
        .from("profiles")
        .select("id, username, display_name")
        .eq("id", ensuredId)
        .single();
      if (!p2) {
        return new Response(JSON.stringify({ error: "Profile not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      profileData = p2;
    } else {
      profileData = profile;
    }

    const profileId = profileData.id;
    const displayName = profileData.display_name || profileData.username || "User";

    // Parse body
    const body: TokenRequest = await req.json();
    const { conversationId, callType, receiverId, isGroupCall, participantIds, callId } = body;

    if (!conversationId || typeof conversationId !== "string") {
      return new Response(JSON.stringify({ error: "conversationId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!callType || !["audio", "video"].includes(callType)) {
      return new Response(JSON.stringify({ error: "Invalid callType" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify user is member of conversation
    const { data: membership } = await supabase
      .from("conversation_members")
      .select("id")
      .eq("conversation_id", conversationId)
      .eq("user_id", profileId)
      .single();

    if (!membership) {
      return new Response(JSON.stringify({ error: "Not a member of this conversation" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // LiveKit config
    const livekitApiKey = Deno.env.get("LIVEKIT_API_KEY");
    const livekitApiSecret = Deno.env.get("LIVEKIT_API_SECRET");
    const livekitUrl = Deno.env.get("LIVEKIT_URL");

    if (!livekitApiKey || !livekitApiSecret || !livekitUrl) {
      console.error("LiveKit secrets not configured");
      return new Response(JSON.stringify({ error: "Service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Room name = conversationId (persistent per DM)
    const roomName = `call-${conversationId}`;

    let activeCallId = callId;

    if (callId) {
      // Joining existing call — verify it exists and belongs to this conversation
      const { data: existingCall } = await supabase
        .from("calls")
        .select("id, conversation_id, status")
        .eq("id", callId)
        .single();

      if (!existingCall || existingCall.conversation_id !== conversationId) {
        return new Response(JSON.stringify({ error: "Call not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      activeCallId = existingCall.id;
    } else {
      // Creating a new call — need receiverId
      if (!receiverId) {
        return new Response(JSON.stringify({ error: "receiverId required for new call" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const actualReceiverId = receiverId !== profileId
        ? receiverId
        : (participantIds?.find(p => p !== profileId) || receiverId);

      // Create call record
      const { data: callSession, error: callError } = await supabase
        .from("calls")
        .insert({
          conversation_id: conversationId,
          caller_id: profileId,
          receiver_id: actualReceiverId,
          call_type: callType,
          status: "ringing",
          room_name: roomName,
          room_url: livekitUrl,
          is_group_call: isGroupCall || (participantIds ? participantIds.length > 1 : false),
          max_participants: participantIds ? participantIds.length + 1 : 2,
          call_mode: "persistent",
        })
        .select()
        .single();

      if (callError || !callSession) {
        console.error("Failed to create call session:", callError);
        return new Response(JSON.stringify({ error: "Failed to create call session" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      activeCallId = callSession.id;
    }

    // Pre-create the room with a long empty timeout so it behaves like
    // a Discord-style voice room and isn't auto-closed when momentarily empty.
    try {
      const httpUrl = livekitUrl.replace(/^wss?:/, (m) => m === "wss:" ? "https:" : "http:");
      const svc = new RoomServiceClient(httpUrl, livekitApiKey, livekitApiSecret);
      await svc.createRoom({
        name: roomName,
        emptyTimeout: 600, // 10 minutes — keep room alive while users rejoin
        maxParticipants: 50,
      });
    } catch (e) {
      // Room may already exist; that's fine
      console.log("createRoom skipped:", (e as Error)?.message);
    }

    // Generate LiveKit access token
    const at = new AccessToken(livekitApiKey, livekitApiSecret, {
      identity: profileId,
      name: displayName,
      ttl: "4h", // 4 hour token
    });

    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();

    return new Response(
      JSON.stringify({
        token,
        url: livekitUrl,
        roomName,
        callId: activeCallId,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
