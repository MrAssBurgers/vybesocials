// GPTZero-style AI text detector
// Combines statistical signals (perplexity proxy, burstiness) with an LLM judge
// Returns JSON: { ai_probability, verdict, burstiness, perplexity, sentences, highlights }

import { validateAuth } from "../_shared/auth.ts";
import { rateLimitOrNull } from "../_shared/rateLimit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// AI tells: words/phrases that overwhelmingly appear in LLM output
const AI_TELLS = [
  "delve", "navigate the", "tapestry", "landscape of", "realm of", "unleash",
  "leverage", "foster", "robust", "seamless", "comprehensive", "multifaceted",
  "intricate", "nuanced", "paradigm", "holistic", "synergy", "ever-evolving",
  "fast-paced", "in today's world", "in conclusion", "it's important to note",
  "it's worth noting", "moreover", "furthermore", "in essence", "ultimately,",
  "a testament to", "underscores", "underscored", "plays a crucial role",
  "plays a vital role", "pivotal", "crucial", "various", "numerous", "plethora",
  "myriad", "embark on", "navigate the complexities", "in the realm of",
  "stand as a testament", "delving into", "the world of", "as we navigate",
];

function tokenizeSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+(?=[A-Z"'\(])/)
    .filter((s) => s.length > 0);
}

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function stdDev(nums: number[]): number {
  if (nums.length < 2) return 0;
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const variance = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length;
  return Math.sqrt(variance);
}

function calcBurstiness(sentences: string[]): number {
  if (sentences.length < 3) return 50;
  const lengths = sentences.map(wordCount).filter((n) => n > 0);
  const sd = stdDev(lengths);
  // Human writing typically has SD > 7-10. Map to 0-100 (higher = more human/bursty)
  return Math.min(100, Math.round((sd / 14) * 100));
}

function countAITells(text: string): { count: number; matches: string[] } {
  const lower = text.toLowerCase();
  const matches: string[] = [];
  for (const tell of AI_TELLS) {
    if (lower.includes(tell)) matches.push(tell);
  }
  return { count: matches.length, matches };
}

function calcRepetition(text: string): number {
  // Count repeated 3-word phrases (n-gram repetition is an AI signature)
  const words = text.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter(Boolean);
  if (words.length < 6) return 0;
  const trigrams = new Map<string, number>();
  for (let i = 0; i <= words.length - 3; i++) {
    const tri = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
    trigrams.set(tri, (trigrams.get(tri) || 0) + 1);
  }
  let repeats = 0;
  for (const v of trigrams.values()) if (v > 1) repeats += v - 1;
  return Math.min(100, Math.round((repeats / Math.max(1, trigrams.size)) * 200));
}

function uniformityScore(sentences: string[]): number {
  // Higher score = MORE uniform = MORE AI-like
  if (sentences.length < 3) return 0;
  const lengths = sentences.map(wordCount);
  const sd = stdDev(lengths);
  // SD < 4 is robotic; SD > 10 is human
  if (sd >= 10) return 0;
  if (sd <= 3) return 100;
  return Math.round(((10 - sd) / 7) * 100);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = await validateAuth(req);
    if (!auth.authenticated) {
      return new Response(JSON.stringify({ error: auth.error || "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const limited = await rateLimitOrNull(`ai-detect-text:${auth.userId}`, 20, 60, corsHeaders);
    if (limited) return limited;

    const { text } = await req.json().catch(() => ({}));
    if (typeof text !== "string" || !text.trim()) {
      return new Response(JSON.stringify({ error: "text is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (text.length > 12000) {
      return new Response(JSON.stringify({ error: "Max 12000 characters" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1) Statistical signals
    const sentences = tokenizeSentences(text);
    const burstiness = calcBurstiness(sentences); // 0-100, higher = human
    const uniformity = uniformityScore(sentences); // 0-100, higher = AI
    const tells = countAITells(text);
    const repetition = calcRepetition(text);
    const totalWords = wordCount(text);
    const tellsDensity = totalWords > 0 ? Math.min(100, Math.round((tells.count / Math.max(1, totalWords / 100)) * 25)) : 0;

    // Statistical score 0-100 (higher = more AI)
    const statScore = Math.min(100, Math.round(
      uniformity * 0.35 +
      tellsDensity * 0.30 +
      repetition * 0.15 +
      (100 - burstiness) * 0.20
    ));

    // 2) LLM judge (fast)
    let llmScore = statScore; // fallback
    let llmReason = "Statistical analysis only";
    let perSentence: { text: string; ai_prob: number }[] = [];

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (GEMINI_API_KEY) {
      try {
        // 12s timeout — if the judge is slow, fall back to stat-only score
        const ctrl = new AbortController();
        const timeoutId = setTimeout(() => ctrl.abort(), 12_000);
        const judgeResp = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
          method: "POST",
          signal: ctrl.signal,
          headers: {
            Authorization: `Bearer ${GEMINI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gemini-2.5-flash-lite",
            messages: [
              {
                role: "system",
                content: `You are an expert AI-text detector (like GPTZero). Analyze text for signs of LLM generation: uniform sentence rhythm, generic vocabulary (delve, tapestry, navigate, leverage, robust, seamless), perfect grammar with no human quirks, predictable structure, hedge-language, lack of personal voice. Respond ONLY with JSON.`,
              },
              {
                role: "user",
                content: `Score this text for AI generation. Return ONLY valid JSON:
{"ai_probability": 0-100, "reason": "one sentence", "top_suspicious_sentences": ["sentence1", "sentence2"]}

Text:
"""
${text.slice(0, 6000)}
"""`,
              },
            ],
            temperature: 0.1,
            response_format: { type: "json_object" },
          }),
        });

        clearTimeout(timeoutId);
        if (judgeResp.ok) {
          const data = await judgeResp.json();
          const raw = data.choices?.[0]?.message?.content || "{}";
          const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || "{}");
          llmScore = Math.max(0, Math.min(100, Number(parsed.ai_probability) || statScore));
          llmReason = String(parsed.reason || "").slice(0, 200) || llmReason;
          const suspicious: string[] = Array.isArray(parsed.top_suspicious_sentences)
            ? parsed.top_suspicious_sentences.slice(0, 5)
            : [];
          perSentence = sentences.map((s) => ({
            text: s,
            ai_prob: suspicious.some((sus) => s.toLowerCase().includes(String(sus).toLowerCase().slice(0, 40))) ? 90 : 20,
          }));
        }
      } catch (err) {
        console.warn("LLM judge failed, using stat-only:", err);
      }
    }

    // 3) Final blended score (weighted toward LLM judge)
    const finalScore = Math.round(llmScore * 0.65 + statScore * 0.35);

    const verdict =
      finalScore >= 80 ? "Very likely AI" :
      finalScore >= 60 ? "Likely AI" :
      finalScore >= 40 ? "Mixed / uncertain" :
      finalScore >= 20 ? "Likely human" :
      "Very likely human";

    return new Response(
      JSON.stringify({
        ai_probability: finalScore,
        verdict,
        reason: llmReason,
        metrics: {
          burstiness,            // higher = more human
          uniformity,            // higher = more AI
          ai_tells_count: tells.count,
          ai_tells_matched: tells.matches.slice(0, 8),
          repetition,
          word_count: totalWords,
          sentence_count: sentences.length,
        },
        per_sentence: perSentence,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("ai-detect-text error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
