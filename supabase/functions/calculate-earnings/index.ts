import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CALCULATE-EARNINGS] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Run the earnings calculation DB function
    const { data: earningsResult, error: earningsError } = await supabaseAdmin
      .rpc('calculate_creator_earnings');
    
    if (earningsError) {
      logStep("Earnings calculation error", { error: earningsError.message });
    } else {
      logStep("Earnings calculated", earningsResult);
    }

    // Run the trending score update
    const { data: trendingResult, error: trendingError } = await supabaseAdmin
      .rpc('update_trending_scores');

    if (trendingError) {
      logStep("Trending update error", { error: trendingError.message });
    } else {
      logStep("Trending scores updated", trendingResult);
    }

    return new Response(
      JSON.stringify({
        success: true,
        earnings: earningsResult,
        trending: trendingResult,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
