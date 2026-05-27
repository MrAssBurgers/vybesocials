// AI Auto-Fix: receives a runtime error + minimal context from the live app,
// returns a structured "fix plan" the client can execute safely (clear_cache,
// refresh_auth, refetch_queries, prune_storage, reload, none). No code is
// ever patched at runtime — the AI only picks a safe pre-approved action and
// writes a short rationale that the UI shows to the user.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { validateAuth } from "../_shared/auth.ts";
import { rateLimitOrNull } from "../_shared/rateLimit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are VYBE's in-app self-healing agent.
You receive a runtime error from the live app and must pick the safest
auto-recovery action from a fixed set. You never write code. You never
suggest reinstalling. You never guess — if nothing fits, choose "none".

Choose ONE action:
- "clear_cache": stale fetch/network/CDN/chunk-load errors, "Loading chunk", "Failed to fetch", 5xx
- "refresh_auth": JWT/auth/token/session errors, 401/403, "Not authenticated"
- "refetch_queries": React Query / stale data / undefined property on data
- "prune_storage": QuotaExceeded, localStorage full, IndexedDB write fail
- "reload": Unrecoverable render crash, white screen, repeated React error after other actions
- "none": Validation errors, user input issues, intentional aborts, or anything ambiguous

Keep "user_message" short (<=70 chars), friendly, no jargon, no emoji.
Keep "rationale" <=140 chars, plain English, no code.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await validateAuth(req);
    if (!auth.authenticated) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Tight rate limit — this is invoked from a popup, never on hot paths.
    const limited = await rateLimitOrNull(`ai-auto-fix:${auth.userId}`, 8, 60, corsHeaders);
    if (limited) return limited;

    const { message, stack, route, occurrences } = await req.json();
    if (typeof message !== "string" || !message.trim()) {
      return new Response(JSON.stringify({ error: "message required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userContext = [
      `Error: ${String(message).slice(0, 400)}`,
      route ? `Route: ${String(route).slice(0, 80)}` : "",
      typeof occurrences === "number" ? `Repeats in 60s: ${occurrences}` : "",
      stack ? `Stack (top): ${String(stack).split("\n").slice(0, 4).join(" | ").slice(0, 400)}` : "",
    ].filter(Boolean).join("\n");

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        temperature: 0.1,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContext },
        ],
        tools: [{
          type: "function",
          function: {
            name: "apply_fix",
            description: "Pick the safest auto-recovery action for this runtime error.",
            parameters: {
              type: "object",
              properties: {
                action: {
                  type: "string",
                  enum: ["clear_cache", "refresh_auth", "refetch_queries", "prune_storage", "reload", "none"],
                },
                user_message: { type: "string", description: "Friendly one-liner to show the user." },
                rationale: { type: "string", description: "Why this action was chosen." },
                confidence: { type: "number", description: "0-1 confidence the action will help." },
              },
              required: ["action", "user_message", "rationale", "confidence"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "apply_fix" } },
      }),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("ai-auto-fix gateway error:", aiResp.status, t.slice(0, 400));
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "AI busy, try again shortly" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiResp.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return new Response(JSON.stringify({ fix: { action: "none", user_message: "Couldn't auto-fix", rationale: "No model output", confidence: 0 } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const fix = JSON.parse(toolCall.function.arguments);
    return new Response(JSON.stringify({ fix, success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("ai-auto-fix error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
