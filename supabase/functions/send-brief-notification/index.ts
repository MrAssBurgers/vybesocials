import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.90.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Determine time of day based on hour
function getTimeOfDay(hour: number): 'morning' | 'evening' | 'night' {
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

function getGreeting(timeOfDay: 'morning' | 'evening' | 'night'): string {
  switch (timeOfDay) {
    case 'morning':
      return "☀️ Hey, your morning brief is ready!";
    case 'evening':
      return "🌅 Hey, your evening brief is ready!";
    case 'night':
      return "🌙 Hey, your night brief is ready!";
  }
}

function getBody(timeOfDay: 'morning' | 'evening' | 'night'): string {
  switch (timeOfDay) {
    case 'morning':
      return "Start your day with personalized updates";
    case 'evening':
      return "Catch up on what happened today";
    case 'night':
      return "Wind down with your daily summary";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Get current hour to determine time of day
    const now = new Date();
    const hour = now.getUTCHours();
    const timeOfDay = getTimeOfDay(hour);
    
    console.log(`Sending ${timeOfDay} brief notifications at hour ${hour} UTC`);
    
    // Get all users with push notifications enabled
    const { data: tokens, error: tokenError } = await supabase
      .from("push_tokens")
      .select("user_id, token")
      .eq("platform", "web");

    if (tokenError) {
      console.error("Error fetching tokens:", tokenError);
      throw tokenError;
    }

    if (!tokens || tokens.length === 0) {
      console.log("No push tokens found");
      return new Response(
        JSON.stringify({ success: true, message: "No users to notify" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check notification preferences for each user
    const userIds = [...new Set(tokens.map(t => t.user_id))];
    
    const { data: preferences } = await supabase
      .from("notification_preferences")
      .select("user_id, system_enabled")
      .in("user_id", userIds);

    const enabledUsers = new Set(
      preferences?.filter(p => p.system_enabled !== false).map(p => p.user_id) || userIds
    );

    const title = getGreeting(timeOfDay);
    const body = getBody(timeOfDay);

    // Send notifications to enabled users
    let successCount = 0;
    let failCount = 0;

    for (const { user_id, token } of tokens) {
      if (!enabledUsers.has(user_id)) continue;

      try {
        const subscription = JSON.parse(token);
        
        const pushPayload = JSON.stringify({
          title,
          body,
          url: "/?openBrief=true",
          tag: `vybe-brief-${timeOfDay}`,
          type: "brief",
        });

        const response = await fetch(subscription.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "TTL": "86400",
          },
          body: pushPayload,
        });

        if (response.ok) {
          successCount++;
        } else {
          failCount++;
          console.log(`Failed to send to user ${user_id}: ${response.status}`);
        }
      } catch (error) {
        failCount++;
        console.error(`Error sending to user ${user_id}:`, error);
      }
    }

    console.log(`Sent ${successCount} notifications, ${failCount} failed`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        timeOfDay,
        sent: successCount,
        failed: failCount,
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
