import { createClient } from "npm:@supabase/supabase-js@2.90.1";
import {
  buildPushPayload,
  type PushMessage,
  type PushSubscription,
  type VapidKeys,
} from "npm:@block65/webcrypto-web-push@1.0.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PushPayload {
  userId: string;
  title: string;
  body: string;
  url?: string;
  tag?: string;
  type?: string;
  data?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");

    // ── Authentication ─────────────────────────────────────────────────────
    // Allow either:
    //  (a) service-role server-to-server calls from other edge functions, OR
    //  (b) authenticated user calls where the requested userId matches the
    //      caller's profile.id (so users can only push to themselves).
    const authHeader = req.headers.get("Authorization") || "";
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const isServiceRole = !!bearer && bearer === supabaseServiceKey;

    let callerAuthUserId: string | null = null;
    if (!isServiceRole) {
      if (!bearer) {
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
      });
      const { data: userData, error: authErr } = await userClient.auth.getUser(bearer);
      if (authErr || !userData?.user) {
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      callerAuthUserId = userData.user.id;
    }

    // VAPID keys are required for Web Push
    if (!vapidPublicKey || !vapidPrivateKey) {
      console.error("VAPID keys not configured - push notifications will fail");
      return new Response(
        JSON.stringify({ success: false, error: "VAPID keys not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const vapid: VapidKeys = {
      subject: "mailto:support@vybe.app",
      publicKey: vapidPublicKey,
      privateKey: vapidPrivateKey,
    };

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { userId, title, body, url, tag, type, data }: PushPayload = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ success: false, error: "userId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Authorization: non-service callers can only push to themselves or to a
    // user with whom they share an active conversation. Prevents push phishing.
    if (!isServiceRole && callerAuthUserId) {
      const { data: rlOk } = await supabase.rpc("check_rate_limit", {
        p_key: `push_send:${callerAuthUserId}`,
        p_max_requests: 60,
        p_window_seconds: 60,
      });
      if (rlOk === false) {
        return new Response(
          JSON.stringify({ success: false, error: "Too many push requests. Please wait." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Resolve caller's profile id (push targets are profile ids).
      const { data: callerProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", callerAuthUserId)
        .maybeSingle();
      const callerProfileId = callerProfile?.id as string | undefined;

      if (!callerProfileId) {
        return new Response(
          JSON.stringify({ success: false, error: "Forbidden" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (userId && userId !== callerProfileId) {
        // Must share at least one conversation
        const { data: callerConvs } = await supabase
          .from("conversation_members")
          .select("conversation_id")
          .eq("user_id", callerProfileId);
        const convIds = (callerConvs || []).map((r: any) => r.conversation_id);
        let allowed = false;
        if (convIds.length > 0) {
          const { data: shared } = await supabase
            .from("conversation_members")
            .select("id")
            .eq("user_id", userId)
            .in("conversation_id", convIds)
            .limit(1);
          allowed = !!(shared && shared.length > 0);
        }
        if (!allowed) {
          return new Response(
            JSON.stringify({ success: false, error: "Forbidden: no shared conversation with target" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    // ── OneSignal fan-out (covers Despia APK + iOS native shells) ─────────────
    // Fire-and-forget; runs in parallel with Web Push below.
    const onesignalAppId = Deno.env.get("ONESIGNAL_APP_ID");
    const onesignalRestKey = Deno.env.get("ONESIGNAL_REST_API_KEY");
    let onesignalResult: unknown = null;
    if (onesignalAppId && onesignalRestKey) {
      try {
        const res = await fetch("https://api.onesignal.com/notifications", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // OneSignal accepts both "Basic <key>" (legacy) and "Key <key>" (new).
            // Despia docs show "Basic"; keep that for maximum compatibility.
            Authorization: `Basic ${onesignalRestKey}`,
          },
          body: JSON.stringify({
            app_id: onesignalAppId,
            // Send to BOTH new (aliases) and legacy (external_user_ids) targeting
            // so this works regardless of which OneSignal SDK Despia is using.
            include_aliases: { external_id: [userId] },
            include_external_user_ids: [userId],
            target_channel: "push",
            headings: { en: title },
            contents: { en: body },
            big_picture: (data as any)?.image_url,
            ios_attachments: (data as any)?.image_url ? { id1: (data as any).image_url } : undefined,
            chrome_web_image: (data as any)?.image_url,
            data: { type: type || "general", url: url || "/notifications", ...(data || {}) },
            ios_sound: type === "call" ? "ringtone.caf" : "default",
            // NOTE: android_channel_id intentionally omitted — custom channels
            // ("calls"/"messages") are not configured in the OneSignal app, and
            // sending an unknown channel id causes OneSignal to reject the
            // entire push with HTTP 400, blocking ALL phone notifications.
            // OneSignal falls back to its default channel when omitted.
            android_visibility: 1,
            mutable_content: true,
            content_available: true,
            priority: 10,
            ttl: type === "call" ? 30 : 86400,
            collapse_id: tag || undefined,
          }),
        });
        onesignalResult = { status: res.status, ok: res.ok };
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          console.warn("[push] OneSignal non-OK", res.status, txt.slice(0, 200));
        }
      } catch (err) {
        console.warn("[push] OneSignal send failed:", err);
      }
    }

    // Get user's web-push tokens (browser/PWA)
    const { data: tokens, error: tokenError } = await supabase
      .from("push_tokens")
      .select("id, token, platform")
      .eq("user_id", userId);

    if (tokenError) {
      console.error("Error fetching tokens:", tokenError);
      throw tokenError;
    }
    
    if (!tokens || tokens.length === 0) {
      // Web Push has no targets, but OneSignal may have already delivered to native devices.
      return new Response(
        JSON.stringify({ success: !!onesignalResult, sent: 0, onesignal: onesignalResult, error: onesignalResult ? undefined : "No push tokens found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build push payload
    const dataAny = (data || {}) as Record<string, unknown>;
    const pushPayload = JSON.stringify({
      title,
      body,
      url: url || "/notifications",
      tag: tag || "vybe-notification",
      type: type || "general",
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-96x96.png",
      image: (dataAny.image_url as string | undefined) || undefined,
      ...dataAny,
    });

    // Send push to all registered devices
    const results = await Promise.all(
      tokens.map(async ({ id, token, platform }: any) => {
        // Despia native rows are markers only — OneSignal handled delivery above.
        if (platform === "despia" || (typeof token === "string" && token.startsWith("despia:"))) {
          return { success: true, native: true };
        }
        try {
          let subscription;
          try {
            subscription = JSON.parse(token);
          } catch {
            console.error("Invalid token format for token id:", id);
            // Clean up invalid token
            await supabase.from("push_tokens").delete().eq("id", id);
            return { success: false, error: "Invalid token format", cleaned: true };
          }

          // Validate subscription has required fields
          if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
            console.error("Missing endpoint/keys for token id:", id);
            await supabase.from("push_tokens").delete().eq("id", id);
            return { success: false, error: "Missing endpoint or keys", cleaned: true };
          }

          // Build and send an encrypted Web Push request (WebCrypto-based)
          try {
            const subscriptionTyped: PushSubscription = {
              endpoint: subscription.endpoint,
              expirationTime: subscription.expirationTime ?? null,
              keys: {
                p256dh: subscription.keys.p256dh,
                auth: subscription.keys.auth,
              },
            };

            const message: PushMessage = {
              data: pushPayload,
              options: {
                ttl: 86400, // 24 hours
              },
            };

            const payload = await buildPushPayload(message, subscriptionTyped, vapid);

            // RFC 8030 urgency header (optional)
            const urgency = type === "call" ? "high" : "normal";
            const headers = new Headers(payload.headers as HeadersInit);
            headers.set("Urgency", urgency);
            payload.headers = headers;

            const res = await fetch(subscriptionTyped.endpoint, payload);

            if (res.ok) {
              console.log("Push sent successfully to:", subscriptionTyped.endpoint.substring(0, 50));
              return { success: true, statusCode: res.status };
            }

            if (res.status === 404 || res.status === 410) {
              console.log("Cleaning up expired subscription:", id);
              await supabase.from("push_tokens").delete().eq("id", id);
              return { success: false, error: "Subscription expired", cleaned: true };
            }

            if (res.status === 429) {
              console.log("Rate limited for subscription:", id);
              return { success: false, error: "Rate limited" };
            }

            if (res.status === 401 || res.status === 403) {
              const bodyText = await res.text().catch(() => "");
              console.error("Auth error:", res.status, bodyText);
              return { success: false, error: `Auth error: ${res.status}` };
            }

            const errorText = await res.text().catch(() => "");
            console.error("Push error response:", res.status, errorText);
            return { success: false, error: `Push service error: ${res.status}` };
          } catch (pushError) {
            console.error("Push error:", pushError);
            return { success: false, error: String(pushError) };
          }
        } catch (error) {
          console.error("Error sending push:", error);
          return { success: false, error: String(error) };
        }
      })
    );

    // Count successes
    const successCount = results.filter(r => r.success).length;
    const cleanedCount = results.filter(r => r.cleaned).length;

    return new Response(
      JSON.stringify({
        success: successCount > 0 || !!onesignalResult,
        sent: successCount,
        cleaned: cleanedCount,
        total: tokens.length,
        onesignal: onesignalResult,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
