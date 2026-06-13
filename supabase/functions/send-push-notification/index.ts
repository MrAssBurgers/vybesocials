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
type OneSignalSubscription = { id?: string; type?: string; enabled?: boolean; notification_types?: number | null };
type PushTokenRow = { id: string; token: string; platform: string };
const PUSH_SUBSCRIPTION_TYPES = ["iOSPush", "AndroidPush", "ChromePush", "FirefoxPush", "SafariPush", "HuaweiPush"];

function isActivePushSubscription(sub: OneSignalSubscription) {
  if (!sub?.id || !sub.type || !PUSH_SUBSCRIPTION_TYPES.includes(sub.type)) return false;
  // OneSignal's User lookup can omit `enabled`. Only explicit false is disabled;
  // positive notification_types is the source of truth for subscribed devices.
  return sub.enabled !== false && (sub.notification_types ?? 1) > 0;
}

async function fetchJsonWithTimeout(url: string, init: RequestInit, timeoutMs = 3_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function lookupOneSignalSubscriptionIds(appId: string, restKey: string, externalId: string): Promise<string[]> {
  const res = await fetchJsonWithTimeout(
    `https://api.onesignal.com/apps/${appId}/users/by/external_id/${encodeURIComponent(externalId)}`,
    { headers: { Authorization: `Key ${restKey}`, Accept: "application/json" } },
  );
  if (!res.ok) return [];
  const user = await res.json().catch(() => null);
  const subs: OneSignalSubscription[] = Array.isArray(user?.subscriptions) ? user.subscriptions : [];
  return subs.filter(isActivePushSubscription).map((sub) => String(sub.id));
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const padded = part + "=".repeat((4 - (part.length % 4)) % 4);
    return JSON.parse(atob(padded.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

function projectRefFromUrl(url: string): string {
  try {
    return new URL(url).hostname.split(".")[0] ?? "";
  } catch {
    return "";
  }
}

/** DB triggers use vault JWT; edge runtime may inject a different service key format. */
function isServiceRoleBearer(bearer: string, supabaseUrl: string, configuredKey: string): boolean {
  if (!bearer) return false;
  if (bearer === configuredKey) return true;
  const payload = decodeJwtPayload(bearer);
  if (!payload) return false;
  return payload.role === "service_role"
    && payload.iss === "supabase"
    && payload.ref === projectRefFromUrl(supabaseUrl);
}

/** push_tokens + OneSignal external_id use profiles.id — accept auth uid too. */
async function resolvePushTargetProfileId(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<string | null> {
  const { data: byId } = await supabase.from("profiles").select("id").eq("id", userId).maybeSingle();
  if (byId?.id) return byId.id as string;
  const { data: byAuth } = await supabase.from("profiles").select("id").eq("user_id", userId).maybeSingle();
  return (byAuth?.id as string | undefined) ?? null;
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
    const isServiceRole = isServiceRoleBearer(bearer, supabaseUrl, supabaseServiceKey);

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

    // VAPID keys are required for Web Push (browser/PWA). Native OneSignal
    // delivery still works when VAPID is unset.
    const vapid: VapidKeys | null =
      vapidPublicKey && vapidPrivateKey
        ? {
          subject: "mailto:support@vybe.app",
          publicKey: vapidPublicKey,
          privateKey: vapidPrivateKey,
        }
        : null;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { userId, title, body, url, tag, type, data }: PushPayload = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ success: false, error: "userId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const targetProfileId = (await resolvePushTargetProfileId(supabase, userId)) ?? userId;
    const routePath = url || "/notifications";
    const mergedData = { type: type || "general", url: routePath, path: routePath, ...(data || {}) };
    const isCall = type === "call" || mergedData.type === "call" || mergedData.type === "incoming_call";

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
        const convIds = ((callerConvs || []) as Array<{ conversation_id: string }>).map((r) => r.conversation_id);
        let allowed = false;
        if (convIds.length > 0) {
          const { data: shared } = await supabase
            .from("conversation_members")
            .select("id")
            .eq("user_id", targetProfileId)
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
    let onesignalDelivered = false;
    if (onesignalAppId && onesignalRestKey) {
      try {
        const subscriptionIds = await lookupOneSignalSubscriptionIds(onesignalAppId, onesignalRestKey, targetProfileId);
        const imageUrl = typeof data?.image_url === "string" ? data.image_url : undefined;
        if (subscriptionIds.length === 0) {
          console.warn("[push] No actively subscribed OneSignal subscriptions", targetProfileId);
          onesignalResult = { status: 0, ok: false, subscriptionIds: 0, recipients: 0, errors: ["No actively subscribed OneSignal subscriptions"] };
        } else {
          const callChannelId = Deno.env.get("ONESIGNAL_CALL_CHANNEL_ID");
          const res = await fetchJsonWithTimeout("https://api.onesignal.com/notifications", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Key ${onesignalRestKey}`,
          },
          body: JSON.stringify({
            app_id: onesignalAppId,
            include_subscription_ids: subscriptionIds,
            target_channel: "push",
            headings: { en: title },
            contents: { en: body },
            big_picture: imageUrl,
            ios_attachments: imageUrl ? { id1: imageUrl } : undefined,
            chrome_web_image: imageUrl,
            url: routePath,
            web_url: routePath,
            data: mergedData,
            ios_sound: isCall ? "ringtone.caf" : "default",
            ios_interruption_level: isCall ? "time_sensitive" : undefined,
            android_visibility: 1,
            mutable_content: true,
            content_available: true,
            priority: 10,
            ttl: isCall ? 45 : 86400,
            collapse_id: tag || undefined,
            ...(callChannelId ? { android_channel_id: callChannelId } : {}),
            ...(isCall ? {
              buttons: [
                { id: "accept", text: "Answer", icon: "ic_menu_call" },
                { id: "decline", text: "Decline", icon: "ic_menu_close_clear_cancel" },
              ],
            } : {}),
          }),
          }, 4_000);
          const json = await res.json().catch(() => null);
          onesignalDelivered = res.ok && !json?.errors && (json?.recipients ?? 0) > 0;
          onesignalResult = { status: res.status, ok: res.ok, subscriptionIds: subscriptionIds.length, recipients: json?.recipients ?? 0, errors: json?.errors };
          if (!res.ok) {
            console.warn("[push] OneSignal non-OK", res.status, JSON.stringify(json).slice(0, 200));
          }
        }
      } catch (err) {
        console.warn("[push] OneSignal send failed:", err);
      }
    }

    // Get user's web-push tokens (browser/PWA)
    const { data: tokens, error: tokenError } = await supabase
      .from("push_tokens")
      .select("id, token, platform")
      .eq("user_id", targetProfileId);

    if (tokenError) {
      console.error("Error fetching tokens:", tokenError);
      throw tokenError;
    }
    
    if (!tokens || tokens.length === 0) {
      // Web Push has no targets, but OneSignal may have already delivered to native devices.
      return new Response(
        JSON.stringify({ success: onesignalDelivered, sent: 0, onesignal: onesignalResult, error: onesignalDelivered ? undefined : "No push tokens found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!vapid) {
      return new Response(
        JSON.stringify({
          success: onesignalDelivered,
          sent: 0,
          onesignal: onesignalResult,
          error: onesignalDelivered ? undefined : "VAPID keys not configured for web push",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Build push payload
    const dataAny = mergedData as Record<string, unknown>;
    const pushPayload = JSON.stringify({
      title,
      body,
      url: routePath,
      tag: tag || "vybe-notification",
      type: type || "general",
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-96x96.png",
      image: (dataAny.image_url as string | undefined) || undefined,
      ...dataAny,
    });

    // Send push to all registered devices
    const results = await Promise.all(
      (tokens as PushTokenRow[]).map(async ({ id, token, platform }) => {
        // Despia native rows are markers only — OneSignal handled delivery above.
        if (platform === "despia" || (typeof token === "string" && token.startsWith("despia:"))) {
          return { success: onesignalDelivered, native: true };
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
        success: successCount > 0 || onesignalDelivered,
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
