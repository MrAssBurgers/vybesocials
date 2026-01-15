import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phone, code, userId } = await req.json();

    if (!phone || !code) {
      return new Response(
        JSON.stringify({ error: "Phone and code are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const normalizePhone = (raw: string) => {
      const trimmed = String(raw).trim();
      const digits = trimmed.replace(/\D/g, "");
      if (!digits) return "";
      return trimmed.startsWith("+") ? `+${digits}` : `+1${digits}`;
    };

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      return new Response(
        JSON.stringify({ error: "Invalid phone number" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    
    // Get the verification record
    const { data: verification, error: fetchError } = await supabase
      .from("phone_verifications")
      .select("*")
      .eq("phone", normalizedPhone)
      .eq("code", code)
      .single();

    if (fetchError || !verification) {
      return new Response(
        JSON.stringify({ error: "Invalid verification code" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if expired
    if (new Date(verification.expires_at) < new Date()) {
      // Delete expired code
      await supabase.from("phone_verifications").delete().eq("id", verification.id);
      
      return new Response(
        JSON.stringify({ error: "Verification code has expired" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update user profile with verified phone
    if (userId) {
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ 
          phone_number: normalizedPhone,
          phone_verified: true,
        })
        .eq("id", userId);

      if (updateError) {
        console.error("Profile update error:", updateError);
      }
    }

    // Delete the used verification code
    await supabase.from("phone_verifications").delete().eq("id", verification.id);

    return new Response(
      JSON.stringify({ success: true, message: "Phone verified successfully" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
