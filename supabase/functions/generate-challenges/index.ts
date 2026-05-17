import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VALID_REQUIREMENT_TYPES = [
  "post", "like", "comment", "follow", "message", 
  "new_conversation", "snap_sent", "bookmark", "invite", "login"
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Auth: only allow service-role caller (cron) or admin/owner JWT
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const isInternal = token && token === supabaseServiceKey;

    if (!isInternal) {
      // Validate JWT and check admin/owner role
      const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData, error: userErr } = await userClient.auth.getUser(token);
      if (userErr || !userData?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const adminClient = createClient(supabaseUrl, supabaseServiceKey);
      const { data: rolesAuth } = await adminClient
        .from("user_roles_auth")
        .select("role")
        .eq("user_id", userData.user.id);
      let isAdmin = rolesAuth?.some((r: any) => r.role === "admin" || r.role === "owner");
      if (!isAdmin) {
        const { data: profile } = await adminClient
          .from("profiles").select("id").eq("user_id", userData.user.id).maybeSingle();
        if (profile) {
          const { data: roles } = await adminClient
            .from("user_roles").select("role").eq("user_id", profile.id);
          isAdmin = roles?.some((r: any) => r.role === "admin" || r.role === "owner");
        }
      }
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse optional body overrides (target_date / target_week_start)
    let bodyTargetDate: string | null = null;
    let bodyTargetWeek: string | null = null;
    let onlyType: 'daily' | 'weekly' | null = null;
    try {
      const body = await req.json();
      if (body?.target_date && /^\d{4}-\d{2}-\d{2}$/.test(body.target_date)) bodyTargetDate = body.target_date;
      if (body?.target_week_start && /^\d{4}-\d{2}-\d{2}$/.test(body.target_week_start)) bodyTargetWeek = body.target_week_start;
      if (body?.type === 'daily' || body?.type === 'weekly') onlyType = body.type;
    } catch {}

    // Compute defaults (UTC today / current ISO week Monday)
    const now = new Date();
    const day = now.getUTCDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + mondayOffset));

    const today = bodyTargetDate || now.toISOString().split("T")[0];
    const weekStart = bodyTargetWeek || monday.toISOString().split("T")[0];

    const targetDateObj = new Date(today + 'T00:00:00Z');
    const dayOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][targetDateObj.getUTCDay()];
    const month = targetDateObj.toLocaleString("en-US", { month: "long" });
    const dayOfMonth = targetDateObj.getUTCDate();

    // Get existing active challenge titles to avoid duplicates
    const { data: existingChallenges } = await supabase
      .from("challenges")
      .select("title")
      .eq("is_active", true);
    const existingTitles = (existingChallenges || []).map(t => t.title);

    const prompt = `Generate 12 unique social media app challenges for a platform called VYBE. Today is ${dayOfWeek}, ${month} ${dayOfMonth}.

Generate EXACTLY 6 DAILY challenges and EXACTLY 6 WEEKLY challenges. This is critical — do not generate fewer.

TODAY IS ${dayOfWeek.toUpperCase()}. The daily challenges MUST reflect the energy and theme of ${dayOfWeek}:
- Monday: fresh starts, motivation, setting intentions, "new week new me" energy
- Tuesday: grind mode, productivity, consistency, "locked in" vibes  
- Wednesday: midweek check-in, hump day energy, social catch-ups
- Thursday: almost there, throwback vibes, sharing memories
- Friday: celebration, weekend prep, party energy, going out vibes
- Saturday: weekend mode, creativity, exploring, self-care, chill content
- Sunday: rest & reset, reflection, cozy vibes, planning ahead

Rules:
- Each challenge MUST use one of these requirement_types: ${VALID_REQUIREMENT_TYPES.join(", ")}
- Daily challenges should have requirement_count between 1-5
- Weekly challenges should have requirement_count between 5-25
- Daily XP rewards: 10-40
- Weekly XP rewards: 40-100
- Titles should be catchy, Gen-Z friendly, max 25 chars
- Descriptions should be action-oriented and reference the day's theme, max 50 chars
- Don't reuse these existing titles: ${existingTitles.slice(0, 20).join(", ")}
- Mix up the requirement_types — use at least 5 different types across the 6 dailies and at least 5 different types across the 6 weeklies
- At least 2 daily challenges should directly reference ${dayOfWeek} in the title or description
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
        // Rate limited — fall back to template rotation
        await supabase.rpc("rotate_challenges");
        return new Response(JSON.stringify({ error: "Rate limited, used fallback rotation" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        await supabase.rpc("rotate_challenges");
        return new Response(JSON.stringify({ error: "Credits exhausted, used fallback rotation" }), {
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
      type: c.type as "daily" | "weekly",
      requirement_type: c.requirement_type,
      requirement_count: Math.min(c.type === "daily" ? 5 : 25, Math.max(1, c.requirement_count)),
      reward_xp: Math.min(c.type === "daily" ? 40 : 100, Math.max(10, c.reward_xp)),
    }));

    if (validChallenges.length === 0) {
      throw new Error("No valid challenges after sanitization");
    }

    const dailyChallenges = validChallenges.filter(c => c.type === "daily").slice(0, 6);
    const weeklyChallenges = validChallenges.filter(c => c.type === "weekly").slice(0, 6);

    // Check existing active counts for the target date / week (idempotency)
    const { count: existingDailyCount } = await supabase
      .from("challenges")
      .select("*", { count: "exact", head: true })
      .eq("type", "daily")
      .eq("active_date", today)
      .eq("is_active", true);

    const { count: existingWeeklyCount } = await supabase
      .from("challenges")
      .select("*", { count: "exact", head: true })
      .eq("type", "weekly")
      .eq("active_week_start", weekStart)
      .eq("is_active", true);

    const shouldInsertDaily = (onlyType !== 'weekly') && dailyChallenges.length > 0 && (existingDailyCount || 0) < 6;
    const shouldInsertWeekly = (onlyType !== 'daily') && weeklyChallenges.length > 0 && (existingWeeklyCount || 0) < 6;

    const challengeRows: any[] = [];
    if (shouldInsertDaily) {
      challengeRows.push(...dailyChallenges.map(c => ({
        title: c.title,
        description: c.description,
        type: "daily",
        requirement_type: c.requirement_type,
        requirement_count: c.requirement_count,
        reward_xp: c.reward_xp,
        is_active: true,
        active_date: today,
        active_week_start: null,
      })));
    }
    if (shouldInsertWeekly) {
      challengeRows.push(...weeklyChallenges.map(c => ({
        title: c.title,
        description: c.description,
        type: "weekly",
        requirement_type: c.requirement_type,
        requirement_count: c.requirement_count,
        reward_xp: c.reward_xp,
        is_active: true,
        active_date: null,
        active_week_start: weekStart,
      })));
    }

    let inserted: any[] = [];
    if (challengeRows.length > 0) {
      const { data, error: insertError } = await supabase
        .from("challenges")
        .insert(challengeRows)
        .select();
      if (insertError) {
        console.error("Insert error:", insertError);
        throw insertError;
      }
      inserted = data || [];
    } else {
      console.log(`Skipped insert — target ${today}/${weekStart} already has ${existingDailyCount} daily and ${existingWeeklyCount} weekly active.`);
    }

    // Save as templates for fallback rotation (always — grows the template library)
    const templateRows = validChallenges.map(c => ({
      title: c.title,
      description: c.description,
      type: c.type,
      requirement_type: c.requirement_type,
      requirement_count: c.requirement_count,
      reward_xp: c.reward_xp,
      is_active: true,
    }));
    if (templateRows.length > 0) {
      await supabase.from("challenge_templates").insert(templateRows);
    }

    // 5. Cleanup + safety top-up via SQL (timezone-aware)
    try {
      await supabase.rpc("ensure_active_challenges");
    } catch (cleanupErr) {
      console.error("ensure_active_challenges failed (non-fatal):", cleanupErr);
    }

    console.log(`Generated ${challengeRows.length} AI challenges for today (${today}), week (${weekStart})`);

    return new Response(JSON.stringify({ 
      success: true, 
      generated: challengeRows.length,
      challenges: inserted 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("generate-challenges error:", error);
    
    // Fallback: ensure slots are filled from templates (SQL safety net)
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      await supabase.rpc("ensure_active_challenges");
      console.log("Fallback: ensured active challenges from templates");
    } catch (fallbackErr) {
      console.error("Fallback ensure_active_challenges also failed:", fallbackErr);
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
