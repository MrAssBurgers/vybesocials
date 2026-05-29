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
    const body = await req.json();
    const { bugId } = body || {};
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

    // Skip if already analyzed (unless force re-check requested)
    const force = !!body?.force;
    if (!force && bug.ai_analysis && bug.ai_analysis.length > 10) {
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // For force re-check: count recent occurrences of similar errors (last 24h)
    // and whether the same fingerprint has appeared since this bug was filed.
    let recurrenceNote = "";
    let recentCount = 0;
    let sinceFiledCount = 0;
    const verify = !!body?.verify;
    if (force && bug.error_message) {
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count: c24 } = await admin
        .from("bug_reports")
        .select("id", { count: "exact", head: true })
        .eq("error_message", bug.error_message)
        .gte("created_at", since24h);
      recentCount = c24 ?? 0;

      // Has it recurred since this report was filed? (best signal that the bug is still alive)
      const { data: thisRow } = await admin
        .from("bug_reports")
        .select("created_at")
        .eq("id", bugId)
        .maybeSingle();
      if (thisRow?.created_at) {
        const { count: cSince } = await admin
          .from("bug_reports")
          .select("id", { count: "exact", head: true })
          .eq("error_message", bug.error_message)
          .gt("created_at", thisRow.created_at);
        sinceFiledCount = cSince ?? 0;
      }
      recurrenceNote = `RECENT OCCURRENCES (last 24h): ${recentCount}\nRECURRENCES SINCE THIS REPORT WAS FILED: ${sinceFiledCount}\n`;
    }

    const prompt = [
      `You are a senior React/TypeScript engineer triaging a frontend crash report from a social media app called Vybe (React + Vite + Supabase, runs on web, iOS PWA, and an Android Despia WebView APK).`,
      ``,
      `ERROR: ${bug.error_message ?? "(none)"}`,
      `PAGE: ${bug.page_url ?? "(unknown)"}`,
      `USER AGENT: ${bug.user_agent ?? "(unknown)"}`,
      recurrenceNote,
      `STACK:\n${(bug.error_stack ?? "(none)").slice(0, 1500)}`,
      `COMPONENT STACK:\n${(bug.component_stack ?? "(none)").slice(0, 800)}`,
      ``,
      force
        ? `This is a RE-CHECK. Decide whether this is a REAL bug that still needs developer attention. Reply in <= 110 words, plain text, four short sections:\nStatus: <ACTIVE if it is a real reproducible bug AND (sinceFiled > 0 OR last24h > 1), otherwise RESOLVED if no recurrences OR the error is clearly transient/noise (network blips, AbortError, ResizeObserver loop, third-party extensions, navigation cancellations)>\nReal: <YES if this represents an actual defect that needs a code change, NO if it's noise/transient/third-party/expected>\nCause: <single sentence root cause>\nFix: <one or two concrete code-level actions, mention specific files/APIs if obvious>`
        : `Reply in <= 90 words, plain text, two short sections:\nCause: <single sentence root cause hypothesis>\nFix: <one or two concrete code-level actions, mention specific files/APIs if obvious from the stack>`,
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
    const statusMatch = content.match(/Status:\s*(ACTIVE|RESOLVED|LIKELY RESOLVED)/i);
    const realMatch = content.match(/Real:\s*(YES|NO)/i);
    const severity = sevMatch ? sevMatch[1].toLowerCase() : "medium";
    const verdict = statusMatch ? (statusMatch[1].toUpperCase().includes("RESOLVED") ? "RESOLVED" : "ACTIVE") : "ACTIVE";
    const isReal = realMatch ? realMatch[1].toUpperCase() === "YES" : true;
    const cleaned = content.replace(/SEVERITY\s*=\s*\w+/i, "").trim().slice(0, 1000);

    // Decide what to write back. In verify mode the AI gets to flip status.
    const update: Record<string, unknown> = { ai_analysis: cleaned, ai_severity: severity };
    if (verify && force) {
      if (verdict === "RESOLVED" || !isReal) {
        // Auto-clear: not a real bug or no longer reproducing
        update.status = "fixed";
        update.resolved_at = new Date().toISOString();
      }
    }

    await admin.from("bug_reports").update(update).eq("id", bugId);

    return new Response(JSON.stringify({ ok: true, severity, status: verdict, real: isReal, recentCount, sinceFiledCount }), {
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
