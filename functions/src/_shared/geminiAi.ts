import { HttpsError } from 'firebase-functions/v2/https';

const GEMINI_OPENAI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const GEMINI_IMAGE_MODEL = 'gemini-2.0-flash-preview-image-generation';

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: string; [k: string]: unknown }>;
};

function requireGeminiKey(): string {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    throw new HttpsError(
      'failed-precondition',
      'AI not configured — set GEMINI_API_KEY on Cloud Functions',
    );
  }
  if (!key.startsWith('AIza') && !key.startsWith('AQ.')) {
    throw new HttpsError(
      'failed-precondition',
      'GEMINI_API_KEY is invalid — use a Google AI Studio key (AIza…) or access token (AQ.…). Run npm run setup:gemini-secrets.',
    );
  }
  return key;
}

/** Direct Gemini chat completions (OpenAI-compatible endpoint). */
export async function chatCompletion(opts: {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: 'json_object' };
  tools?: unknown[];
  tool_choice?: unknown;
  apiKey?: string;
  usingByok?: boolean;
}): Promise<{ content: string; raw: any; toolCalls?: unknown[] }> {
  const apiKey = opts.apiKey?.trim() || requireGeminiKey();
  const models = [
    ...new Set(
      [opts.model || 'gemini-2.5-flash-lite', 'gemini-2.5-flash-lite', 'gemini-2.5-flash'].filter(Boolean),
    ),
  ];
  let lastErr: string | undefined;

  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 800 * attempt));
      const res = await fetch(GEMINI_OPENAI_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: opts.temperature ?? 0.7,
          max_tokens: opts.max_tokens ?? 1024,
          messages: opts.messages,
          response_format: opts.response_format,
          tools: opts.tools,
          tool_choice: opts.tool_choice,
        }),
      });
      if (res.ok) {
        const raw = await res.json();
        const message = raw?.choices?.[0]?.message;
        const content: string = message?.content ?? '';
        const toolCalls = message?.tool_calls;
        return { content, raw, toolCalls };
      }
      if (res.status === 429) {
        const body = await res.text();
        if (/credit|billing|prepay|depleted|quota/i.test(body)) {
          throw new HttpsError(
            'resource-exhausted',
            'Google AI credits are depleted. Add billing at https://ai.studio/projects or add your own key in Settings → VYBE AI.',
          );
        }
        throw new HttpsError('resource-exhausted', 'AI rate limit — try again shortly');
      }
      if (res.status === 402) throw new HttpsError('failed-precondition', 'AI credits exhausted');
      if (res.status < 500) {
        lastErr = `AI ${res.status}: ${await res.text()}`;
        if (opts.usingByok && (res.status === 401 || res.status === 403)) {
          throw new HttpsError(
            'failed-precondition',
            'Your Google AI key was rejected. Remove API restrictions in AI Studio or create a new key in Settings → VYBE AI.',
          );
        }
        throw new HttpsError('failed-precondition', lastErr);
      }
      lastErr = `AI ${res.status}`;
    }
  }
  throw new HttpsError('unavailable', lastErr || 'AI unavailable');
}

/** Ping Gemini with a BYOK key before persisting it. */
export async function validateGoogleAiKey(key: string): Promise<void> {
  const trimmed = key.trim();
  if (!trimmed) {
    throw new HttpsError('invalid-argument', 'apiKey required');
  }
  const res = await fetch(GEMINI_OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${trimmed}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gemini-2.5-flash-lite',
      max_tokens: 8,
      messages: [{ role: 'user', content: 'ping' }],
    }),
  });
  if (res.ok) return;
  const body = await res.text();
  if (res.status === 401 || res.status === 403) {
    throw new HttpsError(
      'failed-precondition',
      'Your Google AI key was rejected. Remove API restrictions in AI Studio or create a new key.',
    );
  }
  throw new HttpsError(
    'failed-precondition',
    `Key validation failed (${res.status}): ${body.slice(0, 240)}`,
  );
}

/** Generate an image via Gemini image model; returns base64 data URL or null. */
export async function generateImage(prompt: string): Promise<string | null> {
  const apiKey = requireGeminiKey();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    }),
  });
  if (!res.ok) {
    throw new HttpsError('internal', `Image gen ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    const inline = part?.inlineData || part?.inline_data;
    if (inline?.data) {
      const mime = inline.mimeType || inline.mime_type || 'image/png';
      return `data:${mime};base64,${inline.data}`;
    }
  }
  return null;
}
