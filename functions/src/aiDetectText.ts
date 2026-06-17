import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { requireAuth } from './_shared/admin.js';
import { chatCompletion } from './_shared/geminiAi.js';

const AI_TELLS = [
  'delve', 'navigate the', 'tapestry', 'landscape of', 'leverage', 'foster', 'robust', 'seamless',
  'comprehensive', 'multifaceted', 'paradigm', 'holistic', 'synergy', 'moreover', 'furthermore',
  'in conclusion', "it's important to note", 'a testament to', 'plays a crucial role',
];

function tokenizeSentences(text: string): string[] {
  return text.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+(?=[A-Z"'\(])/).filter(Boolean);
}

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function stdDev(nums: number[]): number {
  if (nums.length < 2) return 0;
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  return Math.sqrt(nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length);
}

function calcBurstiness(sentences: string[]): number {
  if (sentences.length < 3) return 50;
  const lengths = sentences.map(wordCount).filter((n) => n > 0);
  return Math.min(100, Math.round((stdDev(lengths) / 14) * 100));
}

function countAITells(text: string): { count: number; matches: string[] } {
  const lower = text.toLowerCase();
  const matches = AI_TELLS.filter((tell) => lower.includes(tell));
  return { count: matches.length, matches };
}

function calcRepetition(text: string): number {
  const words = text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
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
  if (sentences.length < 3) return 0;
  const sd = stdDev(sentences.map(wordCount));
  if (sd >= 10) return 0;
  if (sd <= 3) return 100;
  return Math.round(((10 - sd) / 7) * 100);
}

/** GPTZero-style AI text detector — statistical + Gemini judge. */
export const aiDetectText = onCall({ secrets: ['GEMINI_API_KEY'] }, async (request) => {
  requireAuth(request);
  const { text } = (request.data || {}) as { text?: string };
  if (!text?.trim()) throw new HttpsError('invalid-argument', 'text required');
  if (text.length > 12000) throw new HttpsError('invalid-argument', 'Max 12000 characters');

  const sentences = tokenizeSentences(text);
  const burstiness = calcBurstiness(sentences);
  const uniformity = uniformityScore(sentences);
  const tells = countAITells(text);
  const repetition = calcRepetition(text);
  const totalWords = wordCount(text);
  const tellsDensity = totalWords > 0
    ? Math.min(100, Math.round((tells.count / Math.max(1, totalWords / 100)) * 25))
    : 0;

  const statScore = Math.min(100, Math.round(
    uniformity * 0.35 + tellsDensity * 0.30 + repetition * 0.15 + (100 - burstiness) * 0.20,
  ));

  let llmScore = statScore;
  let llmReason = 'Statistical analysis only';
  let perSentence: { text: string; ai_prob: number }[] = [];

  try {
    const { content } = await chatCompletion({
      model: 'gemini-2.5-flash-lite',
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You are an expert AI-text detector. Respond ONLY with JSON.',
        },
        {
          role: 'user',
          content: `Score for AI generation (0-100). Return JSON: {"ai_probability":0-100,"reason":"one sentence","top_suspicious_sentences":["..."]}\n\nText:\n"""\n${text.slice(0, 6000)}\n"""`,
        },
      ],
    });
    const parsed = JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] || '{}');
    llmScore = Math.max(0, Math.min(100, Number(parsed.ai_probability) || statScore));
    llmReason = String(parsed.reason || '').slice(0, 200) || llmReason;
    const suspicious: string[] = Array.isArray(parsed.top_suspicious_sentences)
      ? parsed.top_suspicious_sentences.slice(0, 5)
      : [];
    perSentence = sentences.map((s) => ({
      text: s,
      ai_prob: suspicious.some((sus) => s.toLowerCase().includes(String(sus).toLowerCase().slice(0, 40))) ? 90 : 20,
    }));
  } catch (err) {
    console.warn('[aiDetectText] LLM judge failed, stat-only:', err);
  }

  const finalScore = Math.round(llmScore * 0.65 + statScore * 0.35);
  const verdict =
    finalScore >= 80 ? 'Very likely AI' :
    finalScore >= 60 ? 'Likely AI' :
    finalScore >= 40 ? 'Mixed / uncertain' :
    finalScore >= 20 ? 'Likely human' :
    'Very likely human';

  return {
    ai_probability: finalScore,
    verdict,
    reason: llmReason,
    metrics: {
      burstiness,
      uniformity,
      ai_tells_count: tells.count,
      ai_tells_matched: tells.matches.slice(0, 8),
      repetition,
      word_count: totalWords,
      sentence_count: sentences.length,
    },
    per_sentence: perSentence,
  };
});
