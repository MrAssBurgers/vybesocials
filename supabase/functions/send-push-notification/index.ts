import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    // Check for VAPID keys (optional - basic push works without them for many browsers)
    if (!vapidPublicKey || !vapidPrivateKey) {
      console.log("VAPID keys not configured - using basic push delivery");
    }

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
          if (!subscription.endpoint) {
            console.error("Missing endpoint for token id:", id);
            await supabase.from("push_tokens").delete().eq("id", id);
            return { success: false, error: "Missing endpoint", cleaned: true };
          }

          // Send push notification
          // For browsers that support Web Push, the payload is delivered to the service worker
          let response;
          
          try {
            // Try sending with JSON payload (modern browsers)
            response = await fetch(subscription.endpoint, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "TTL": "86400", // 24 hours
              },
              body: pushPayload,
            });
          } catch (fetchError) {
            console.error("Primary push failed, trying empty push:", fetchError);
            // Fallback: send empty push to wake service worker
            response = await fetch(subscription.endpoint, {
              method: "POST",
              headers: {
                "TTL": "86400",
                "Content-Length": "0",
              },
            });
          }

          // Handle response status
          if (response.status === 201 || response.status === 200) {
            console.log("Push sent successfully to:", subscription.endpoint.substring(0, 50));
            return { success: true };
          } else if (response.status === 404 || response.status === 410) {
            // Subscription expired or invalid - clean up
            console.log("Cleaning up expired subscription:", id);
            await supabase.from("push_tokens").delete().eq("id", id);
            return { success: false, error: "Subscription expired", cleaned: true };
          } else if (response.status === 429) {
            // Rate limited
            console.log("Rate limited for subscription:", id);
            return { success: false, error: "Rate limited" };
          } else if (response.status === 401 || response.status === 403) {
            // Authentication error - likely VAPID issue
            console.error("Auth error (VAPID may be required):", response.status);
            return { success: false, error: `Auth error: ${response.status}` };
          } else {
            const errorText = await response.text().catch(() => "Unknown error");
            console.error("Push failed:", response.status, errorText);
            return { success: false, error: `HTTP ${response.status}` };
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
