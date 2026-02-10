import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: unknown) => {
  console.log(`[MANAGE-SECRETS] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);
};

// Secrets the owner is allowed to manage from the UI
const ALLOWED_SECRETS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    );

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Not authenticated");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Invalid auth token");

    const userId = userData.user.id;
    logStep("User authenticated", { userId });

    // Owner check
    const { data: isOwnerResult } = await supabaseClient.rpc("is_owner", { _user_id: userId });
    if (!isOwnerResult) {
      return new Response(JSON.stringify({ error: "Access denied" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      });
    }
    logStep("Owner verified");

    const { action, secret_name, secret_value } = await req.json();

    if (action === "list") {
      // Return which secrets exist by checking the app_secrets table
      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        { auth: { persistSession: false } },
      );

      const { data: savedSecrets } = await adminClient
        .from("app_secrets")
        .select("key")
        .in("key", ALLOWED_SECRETS);

      const statuses: Record<string, boolean> = {};
      for (const name of ALLOWED_SECRETS) {
        statuses[name] = savedSecrets?.some((s: { key: string }) => s.key === name) ?? false;
      }
      return new Response(JSON.stringify({ secrets: statuses }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "set") {
      if (!secret_name || !ALLOWED_SECRETS.includes(secret_name)) {
        return new Response(JSON.stringify({ error: `Invalid secret name. Allowed: ${ALLOWED_SECRETS.join(", ")}` }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        });
      }

      if (!secret_value || typeof secret_value !== "string" || secret_value.trim().length === 0) {
        return new Response(JSON.stringify({ error: "Secret value is required" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        });
      }

      // Use the Management API to set the secret
      const projectRef = Deno.env.get("SUPABASE_URL")?.match(/https:\/\/([^.]+)/)?.[1];
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

      if (!projectRef || !serviceRoleKey) {
        throw new Error("Missing project configuration");
      }

      // Set the secret via Supabase Vault (stored in DB, accessible in edge functions)
      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        serviceRoleKey,
        { auth: { persistSession: false } },
      );

      // Store in a secrets table for persistence
      const { error: upsertError } = await adminClient
        .from("app_secrets")
        .upsert(
          { key: secret_name, value: secret_value, updated_by: userId },
          { onConflict: "key" },
        );

      if (upsertError) throw upsertError;

      logStep("Secret saved", { secret_name });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message });
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
