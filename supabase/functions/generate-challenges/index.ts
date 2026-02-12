import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VALID_REQUIREMENT_TYPES = [
  "post", "like", "comment", "follow", "message", 
  "new_conversation", "snap_sent", "bookmark", "invite", "login"
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get existing templates to avoid duplicates
    const { data: existingTemplates } = await supabase
      .from("challenge_templates")
      .select("title")
      .eq("is_active", true);

    const existingTitles = (existingTemplates || []).map(t => t.title);

    // Get today's date for themed challenges
    const now = new Date();
    const dayOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][now.getDay()];
    const month = now.toLocaleString("en-US", { month: "long" });
    const dayOfMonth = now.getDate();

    const prompt = `Generate 6 unique social media app challenges for a platform called VYBE. Today is ${dayOfWeek}, ${month} ${dayOfMonth}.

Generate 3 DAILY challenges and 3 WEEKLY challenges. Make them creative, fun, and varied — never repeat the same boring patterns.

Rules:
- Each challenge MUST use one of these requirement_types: ${VALID_REQUIREMENT_TYPES.join(", ")}
- Daily challenges should have requirement_count between 1-5
- Weekly challenges should have requirement_count between 3-25
- Daily XP rewards: 10-40
- Weekly XP rewards: 40-100
- Titles should be catchy, Gen-Z friendly, max 25 chars
- Descriptions should be action-oriented, max 50 chars
- Don't reuse these existing titles: ${existingTitles.slice(0, 20).join(", ")}
- Mix up the requirement_types — don't use the same type twice in dailies or weeklies
- Consider the day of the week for thematic challenges (e.g. "Monday Motivation", "Friday Vibes")
- Be creative with titles — use emojis sparingly, slang, pop culture references, puns`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: "You are a creative game designer for a Gen-Z social media app. Return ONLY valid JSON, no markdown."
          },
          { role: "user", content: prompt }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "create_challenges",
              description: "Create daily and weekly challenges for the VYBE app",
              parameters: {
                type: "object",
                properties: {
                  challenges: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string", description: "Catchy challenge title, max 25 chars" },
                        description: { type: "string", description: "Action-oriented description, max 50 chars" },
                        type: { type: "string", enum: ["daily", "weekly"] },
                        requirement_type: { type: "string", enum: VALID_REQUIREMENT_TYPES },
                        requirement_count: { type: "number" },
                        reward_xp: { type: "number" }
                      },
                      required: ["title", "description", "type", "requirement_type", "requirement_count", "reward_xp"],
                      additionalProperties: false
                    }
                  }
                },
                required: ["challenges"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "create_challenges" } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, using fallback rotation" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI error: ${response.status}`);
    }

    const aiData = await response.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall) {
      throw new Error("No tool call in AI response");
    }

    const parsed = JSON.parse(toolCall.function.arguments);
    const challenges = parsed.challenges;

    if (!Array.isArray(challenges) || challenges.length === 0) {
      throw new Error("No challenges generated");
    }

    // Validate and sanitize
    const validChallenges = challenges.filter(c => 
      c.title && c.description && 
      ["daily", "weekly"].includes(c.type) &&
      VALID_REQUIREMENT_TYPES.includes(c.requirement_type) &&
      c.requirement_count > 0 && c.reward_xp > 0
    ).map(c => ({
      title: c.title.slice(0, 30),
      description: c.description.slice(0, 60),
      type: c.type,
      requirement_type: c.requirement_type,
      requirement_count: Math.min(c.type === "daily" ? 5 : 25, Math.max(1, c.requirement_count)),
      reward_xp: Math.min(c.type === "daily" ? 40 : 100, Math.max(10, c.reward_xp)),
      is_active: true,
    }));

    if (validChallenges.length === 0) {
      throw new Error("No valid challenges after sanitization");
    }

    // Insert as new templates
    const { data: inserted, error: insertError } = await supabase
      .from("challenge_templates")
      .insert(validChallenges)
      .select();

    if (insertError) {
      console.error("Insert error:", insertError);
      throw insertError;
    }

    // Now run the rotation to pick from the fresh pool
    const { error: rotateError } = await supabase.rpc("rotate_challenges");
    if (rotateError) {
      console.error("Rotation error:", rotateError);
    }

    console.log(`Generated ${validChallenges.length} AI challenges, rotation complete`);

    return new Response(JSON.stringify({ 
      success: true, 
      generated: validChallenges.length,
      challenges: inserted 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("generate-challenges error:", error);
    
    // Fallback: just run the normal rotation from existing templates
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      await supabase.rpc("rotate_challenges");
      console.log("Fallback: used existing template rotation");
    } catch (fallbackErr) {
      console.error("Fallback rotation also failed:", fallbackErr);
    }

    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error",
      fallback: true 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
