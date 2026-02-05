import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as webpush from "https://esm.sh/web-push@3.6.7";

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");

    // VAPID keys are required for Web Push
    if (!vapidPublicKey || !vapidPrivateKey) {
      console.error("VAPID keys not configured - push notifications will fail");
      return new Response(
        JSON.stringify({ success: false, error: "VAPID keys not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Configure web-push with VAPID details
    webpush.setVapidDetails(
      "mailto:support@vybe.app",
      vapidPublicKey,
      vapidPrivateKey
    );

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { userId, title, body, url, tag, type, data }: PushPayload = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ success: false, error: "userId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user's push tokens
    const { data: tokens, error: tokenError } = await supabase
      .from("push_tokens")
      .select("id, token, platform")
      .eq("user_id", userId);

    if (tokenError) {
      console.error("Error fetching tokens:", tokenError);
      throw tokenError;
    }
    
    if (!tokens || tokens.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "No push tokens found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build push payload
    const pushPayload = JSON.stringify({
      title,
      body,
      url: url || "/notifications",
      tag: tag || "vybe-notification",
      type: type || "general",
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-96x96.png",
      ...data,
    });

    // Send push to all registered devices
    const results = await Promise.all(
      tokens.map(async ({ id, token }) => {
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
          if (!subscription.endpoint || !subscription.keys) {
            console.error("Missing endpoint for token id:", id);
            await supabase.from("push_tokens").delete().eq("id", id);
            return { success: false, error: "Missing endpoint or keys", cleaned: true };
          }

          // Send push notification using web-push library with VAPID auth
          try {
            const result = await webpush.sendNotification(
              {
                endpoint: subscription.endpoint,
                keys: subscription.keys,
              },
              pushPayload,
              {
                TTL: 86400, // 24 hours
                urgency: type === "call" ? "high" : "normal",
              }
            );
            
            console.log("Push sent successfully to:", subscription.endpoint.substring(0, 50));
            return { success: true, statusCode: result.statusCode };
          } catch (pushError: any) {
            console.error("Push error:", pushError);
            
            // Handle specific error codes
            if (pushError.statusCode === 404 || pushError.statusCode === 410) {
              // Subscription expired or invalid - clean up
              console.log("Cleaning up expired subscription:", id);
              await supabase.from("push_tokens").delete().eq("id", id);
              return { success: false, error: "Subscription expired", cleaned: true };
            } else if (pushError.statusCode === 429) {
              // Rate limited
              console.log("Rate limited for subscription:", id);
              return { success: false, error: "Rate limited" };
            } else if (pushError.statusCode === 401 || pushError.statusCode === 403) {
              // Authentication error
              console.error("Auth error:", pushError.statusCode, pushError.body);
              return { success: false, error: `Auth error: ${pushError.statusCode}` };
            }
            
            return { success: false, error: pushError.message || String(pushError) };
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
        success: successCount > 0, 
        sent: successCount,
        cleaned: cleanedCount,
        total: tokens.length,
        results 
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
