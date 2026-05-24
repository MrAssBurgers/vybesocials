import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Fetch context in parallel
    const [dnaResult, prefsResult, profileResult] = await Promise.all([
      supabase.from("vybe_dna").select("personality_vector").eq("user_id", user.id).maybeSingle(),
      supabase.from("dna_content_preferences").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("profiles").select("display_name, onboarding_interests").eq("id", user.id).maybeSingle(),
    ]);

    const pv = (dnaResult.data?.personality_vector as Record<string, number>) || {};
    const currentPrefs = prefsResult.data || { boost_topics: [], reduce_topics: [], preferred_content_types: [], discovery_level: "balanced" };
    const profile = profileResult.data;

    const systemPrompt = `You are the VYBE AI — a smart, helpful assistant built into the VYBE social media app. You can answer ANY question on ANY topic — science, math, history, advice, coding, creative writing, philosophy, whatever the user asks.

You KNOW this user:
- Name: ${profile?.display_name || "friend"}
- Their VYBE DNA: Activity ${Math.round((pv.activity || 0) * 100)}%, Social ${Math.round((pv.social || 0) * 100)}%, Creative ${Math.round((pv.creative || 0) * 100)}%
- Interests: ${(profile?.onboarding_interests || []).join(", ") || "not set yet"}
- Boosted topics: ${currentPrefs.boost_topics?.join(", ") || "none"}
- Reduced topics: ${currentPrefs.reduce_topics?.join(", ") || "none"}
- Content types: ${currentPrefs.preferred_content_types?.join(", ") || "all"}
- Discovery level: ${currentPrefs.discovery_level}

Your style:
- Conversational, helpful, and concise
- You live inside VYBE so you're aware of the app context, but you're not limited to it
- Use emoji naturally but don't overdo it
- Keep responses 1-4 sentences unless the user asks for detail or the topic needs more
- Be warm and personal — you know their preferences and DNA

VYBE-specific abilities:
- Tune their feed (boost/reduce topics, discovery level, content types)
- Explain VYBE features (DNA, feed algorithm, communities, messaging, etc.)
- Profile tips and social advice within VYBE
When users express content preferences, ALWAYS call update_preferences.

HARD RULES — refuse these with a brief, firm "I can't help with that":
- Sexual or explicit content
- Hate speech, slurs, or content targeting protected groups
- Violence, self-harm, or instructions to harm others
- Illegal activity instructions (drugs, weapons, hacking, etc.)
- Content exploiting minors in any way
Do NOT lecture — just decline and move on naturally.

IMPORTANT: When the user is NOT asking about feed preferences, just respond normally with text. Do NOT call update_preferences unless they explicitly want to change their feed.`;

    // Single streaming call - route through Lovable AI Gateway
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          ...(messages || []),
        ],
        stream: true,
        tools: [
          {
            type: "function",
            function: {
              name: "update_preferences",
              description: "Update the user's content preferences based on their request. Only call when the user explicitly wants to change what they see.",
              parameters: {
                type: "object",
                properties: {
                  boost_topics: { type: "array", items: { type: "string" }, description: "Topics to show MORE of" },
                  reduce_topics: { type: "array", items: { type: "string" }, description: "Topics to show LESS of" },
                  preferred_content_types: { type: "array", items: { type: "string", enum: ["posts", "videos", "clips", "stories"] } },
                  discovery_level: { type: "string", enum: ["conservative", "balanced", "adventurous"] },
                },
              },
            },
          },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Too many requests" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI gateway error");
    }

    // Read the stream, collect tool calls, and forward content deltas
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const reader = response.body!.getReader();

    const readable = new ReadableStream({
      async start(controller) {
        let toolCallArgs = "";
        let hasToolCall = false;
        let buffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            let newlineIndex: number;
            while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
              let line = buffer.slice(0, newlineIndex);
              buffer = buffer.slice(newlineIndex + 1);

              if (line.endsWith("\r")) line = line.slice(0, -1);
              if (line.startsWith(":") || line.trim() === "") continue;
              if (!line.startsWith("data: ")) continue;

              const jsonStr = line.slice(6).trim();
              if (jsonStr === "[DONE]") continue;

              try {
                const parsed = JSON.parse(jsonStr);
                const delta = parsed.choices?.[0]?.delta;

                // Forward content deltas to client immediately
                if (delta?.content) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(parsed)}\n\n`));
                }

                // Collect tool call arguments
                if (delta?.tool_calls?.[0]) {
                  hasToolCall = true;
                  const tc = delta.tool_calls[0];
                  if (tc.function?.arguments) {
                    toolCallArgs += tc.function.arguments;
                  }
                }
              } catch {
                // Partial JSON, skip
              }
            }
          }

          // Process tool call if detected
          if (hasToolCall && toolCallArgs) {
            try {
              const args = JSON.parse(toolCallArgs);
              const updates: Record<string, unknown> = {};
              if (args.boost_topics?.length) updates.boost_topics = args.boost_topics;
              if (args.reduce_topics?.length) updates.reduce_topics = args.reduce_topics;
              if (args.preferred_content_types?.length) updates.preferred_content_types = args.preferred_content_types;
              if (args.discovery_level) updates.discovery_level = args.discovery_level;

              if (Object.keys(updates).length > 0) {
                updates.user_id = user.id;
                updates.updated_at = new Date().toISOString();
                await supabase.from("dna_content_preferences").upsert(updates as any, { onConflict: "user_id" });

                // Send metadata event
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ preferences_updated: true })}\n\n`));
              }

              // If tool call consumed the response (no content was streamed),
              // make a quick follow-up streaming call to get the text response
              // This shouldn't normally happen with good prompting but handles edge cases
            } catch (e) {
              console.error("Tool call parse error:", e);
            }
          }

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (e) {
          console.error("Stream processing error:", e);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("dna-chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
