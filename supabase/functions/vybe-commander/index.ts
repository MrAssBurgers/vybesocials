import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { validateAuth } from "../_shared/auth.ts";
import { rateLimitOrNull } from "../_shared/rateLimit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await validateAuth(req);
    if (!auth.authenticated) {
      return new Response(JSON.stringify({ error: auth.error || "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const limited = await rateLimitOrNull(`vybe-cmd:${auth.userId}`, 20, 60, corsHeaders);
    if (limited) return limited;

    const { command, context } = await req.json();
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `You are the VYBE AI App Designer — the most personalized AI in social media.
Your motto: "YOUR APP YOUR VYBE" — help users make their app feel completely their own.

You can control the user's app in real time:
1. THEMES — visual appearance. Presets: classic (pink/cyan neon), midnight (ocean blues), neon (electric purple), soft (warm pastel), cyberpunk (yellow/pink), minimal (clean monochrome).
2. LAYOUT — which home sections appear and their order.
3. WIDGETS — individual sections on the home screen.

Available widgets:
- ai_brief: Daily Brief AI catch-up
- xp_streak: XP level progress bar and streak
- stories: Stories bar
- weekly_rhythm: Weekly Vibes activity board
- trending: Trending Tags on VYBE
- online_friends: Online friends strip (mobile)

Current state:
- Visible widgets (in order): ${context?.layout?.join(", ") || "default"}
- Hidden widgets: ${context?.hidden?.join(", ") || "none"}
- Current theme: ${context?.currentPreset || "classic"}

Respond with 1 short enthusiastic sentence. Always call interpret_command to specify changes.
If they just want to chat, return an empty actions array and reply warmly.`;

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: command },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "interpret_command",
              description: "Interpret and apply the user's app customization command",
              parameters: {
                type: "object",
                properties: {
                  message: {
                    type: "string",
                    description: "Short, enthusiastic 1-sentence response to user",
                  },
                  actions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        type: {
                          type: "string",
                          enum: ["apply_theme", "generate_theme", "widget_toggle", "widget_reorder"],
                        },
                        preset: {
                          type: "string",
                          description: "Theme preset key (for apply_theme): classic|midnight|neon|soft|cyberpunk|minimal",
                        },
                        prompt: {
                          type: "string",
                          description: "Natural language theme description for AI generation (for generate_theme)",
                        },
                        widget_id: {
                          type: "string",
                          description: "Widget ID (for widget_toggle)",
                        },
                        visible: {
                          type: "boolean",
                          description: "Show or hide the widget (for widget_toggle)",
                        },
                        order: {
                          type: "array",
                          items: { type: "string" },
                          description: "New widget order array (for widget_reorder)",
                        },
                      },
                      required: ["type"],
                    },
                    description: "List of actions to apply to the user's app",
                  },
                },
                required: ["message", "actions"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "interpret_command" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Too many requests. Wait a moment and try again." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (toolCall?.function?.arguments) {
      const result = JSON.parse(toolCall.function.arguments);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fallback
    const text = data.choices?.[0]?.message?.content || "Your VYBE is looking fresh! 🔥";
    return new Response(JSON.stringify({ message: text, actions: [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("vybe-commander error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
