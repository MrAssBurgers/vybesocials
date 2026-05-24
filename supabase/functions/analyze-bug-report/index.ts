// Auto-analyzes a bug_reports row using Lovable AI Gateway and writes back
// `ai_analysis` (short root-cause + suggested fix) and `ai_severity`.
// Called fire-and-forget by the client right after inserting a bug report.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { bugId } = await req.json();
    if (!bugId || typeof bugId !== "string") {
      return new Response(JSON.stringify({ error: "bugId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: bug, error: fetchErr } = await admin
      .from("bug_reports")
      .select("id, error_message, error_stack, component_stack, page_url, user_agent, ai_analysis")
      .eq("id", bugId)
      .maybeSingle();

    if (fetchErr || !bug) {
      return new Response(JSON.stringify({ error: "bug not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Skip if already analyzed
    if (bug.ai_analysis && bug.ai_analysis.length > 10) {
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = [
      `You are a senior React/TypeScript engineer triaging a frontend crash report from a social media app called Vybe (React + Vite + Supabase, runs on web, iOS PWA, and an Android Despia WebView APK).`,
      ``,
      `ERROR: ${bug.error_message ?? "(none)"}`,
      `PAGE: ${bug.page_url ?? "(unknown)"}`,
      `USER AGENT: ${bug.user_agent ?? "(unknown)"}`,
      `STACK:\n${(bug.error_stack ?? "(none)").slice(0, 1500)}`,
      `COMPONENT STACK:\n${(bug.component_stack ?? "(none)").slice(0, 800)}`,
      ``,
      `Reply in <= 90 words, plain text, two short sections:`,
      `Cause: <single sentence root cause hypothesis>`,
      `Fix: <one or two concrete code-level actions, mention specific files/APIs if obvious from the stack>`,
      ``,
      `Then on a new line write exactly: SEVERITY=low | medium | high | critical`,
    ].join("\n");

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "You are a concise crash triage assistant. No fluff." },
          { role: "user", content: prompt },
        ],
      }),
    });


    if (!aiResp.ok) {
      const text = await aiResp.text();
      return new Response(JSON.stringify({ error: "AI gateway error", status: aiResp.status, text }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    const content: string = aiJson?.choices?.[0]?.message?.content ?? "";
    const sevMatch = content.match(/SEVERITY\s*=\s*(low|medium|high|critical)/i);
    const severity = sevMatch ? sevMatch[1].toLowerCase() : "medium";
    const cleaned = content.replace(/SEVERITY\s*=\s*\w+/i, "").trim().slice(0, 1000);

    await admin
      .from("bug_reports")
      .update({ ai_analysis: cleaned, ai_severity: severity })
      .eq("id", bugId);

    return new Response(JSON.stringify({ ok: true, severity }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-bug-report error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
