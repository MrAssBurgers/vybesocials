import { HttpsError } from 'firebase-functions/v2/https';

const LOVABLE_GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const GEMINI_OPENAI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const IMAGE_URL = 'https://ai.gateway.lovable.dev/v1/images/generations';

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: string; [k: string]: unknown }>;
};

function resolveGateway(): { apiKey: string; url: string; model: string } {
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (lovableKey) {
    return {
      apiKey: lovableKey,
      url: LOVABLE_GATEWAY_URL,
      model: 'google/gemini-2.5-flash',
    };
  }
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    return {
      apiKey: geminiKey,
      url: GEMINI_OPENAI_URL,
      model: 'gemini-2.5-flash',
    };
  }
  throw new HttpsError(
    'failed-precondition',
    'AI not configured — set LOVABLE_API_KEY or GEMINI_API_KEY on Cloud Functions',
  );
}

function lovableImageKey(): string {
  const k = process.env.LOVABLE_API_KEY;
  if (!k) {
    throw new HttpsError('failed-precondition', 'LOVABLE_API_KEY not configured for image generation');
  }
  return k;
}

/** Call Lovable gateway or direct Gemini with retry/fallback. */
export async function chatCompletion(opts: {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  response_format?: { type: 'json_object' };
  tools?: unknown[];
}): Promise<{ content: string; raw: any }> {
  const gateway = resolveGateway();
  const fallbacks =
    gateway.url === LOVABLE_GATEWAY_URL
      ? ['google/gemini-2.5-flash', 'google/gemini-2.5-flash-lite']
      : ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];
  const models = [...new Set([opts.model || gateway.model, ...fallbacks].filter(Boolean))];
  let lastErr: string | undefined;

  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 800 * attempt));
      const res = await fetch(gateway.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${gateway.apiKey}`,
          'Content-Type': 'application/json',
          ...(gateway.url === LOVABLE_GATEWAY_URL ? { 'X-Lovable-AIG-SDK': 'firebase-functions' } : {}),
        },
        body: JSON.stringify({ ...opts, model }),
      });
      if (res.ok) {
        const raw = await res.json();
        const content: string = raw?.choices?.[0]?.message?.content ?? '';
        return { content, raw };
      }
      if (res.status === 429) throw new HttpsError('resource-exhausted', 'AI rate limit — try again shortly');
      if (res.status === 402) throw new HttpsError('failed-precondition', 'AI credits exhausted');
      if (res.status < 500) {
        lastErr = `AI ${res.status}: ${await res.text()}`;
        throw new HttpsError('internal', lastErr);
      }
      lastErr = `AI ${res.status}`;
    }
  }
  throw new HttpsError('unavailable', lastErr || 'AI unavailable');
}

export async function generateImage(prompt: string, model = 'google/gemini-2.5-flash-image-preview'): Promise<string | null> {
  const res = await fetch(IMAGE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${lovableImageKey()}`,
      'Content-Type': 'application/json',
      'X-Lovable-AIG-SDK': 'firebase-functions',
    },
    body: JSON.stringify({ model, prompt }),
  });
  if (!res.ok) throw new HttpsError('internal', `Image gen ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data?.data?.[0]?.url || data?.data?.[0]?.b64_json || null;
}
