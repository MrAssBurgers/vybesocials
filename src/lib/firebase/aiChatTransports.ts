import type { VybeAiChatContext } from './aiChat';
import type { VybeAiChatMessage } from './aiChatHistory';
import { filterAiChatHistoryForApi } from './aiChatHistory';
import { getCanonicalPublishableKey, LEGACY_READ_PROJECT_ID } from '@/lib/canonicalSupabase';
import { readAnySupabaseAccessToken } from '@/lib/supabaseStorageKey';

function resolveSupabaseAiChatUrl(): string {
  return `https://${LEGACY_READ_PROJECT_ID}.supabase.co/functions/v1/ai-chat`;
}

async function buildSupabaseEdgeHeaders(): Promise<Record<string, string>> {
  const supabaseToken = readAnySupabaseAccessToken();
  if (!supabaseToken) {
    throw new Error('Sign in to use VYBE AI.');
  }
  return {
    'Content-Type': 'application/json',
    apikey: getCanonicalPublishableKey(),
    Authorization: `Bearer ${supabaseToken}`,
  };
}

function parseSseDelta(line: string): string | null {
  if (line.startsWith(':') || line.trim() === '') return null;
  if (!line.startsWith('data: ')) return null;
  const jsonStr = line.slice(6).trim();
  if (jsonStr === '[DONE]') return null;
  try {
    const parsed = JSON.parse(jsonStr);
    return parsed.choices?.[0]?.delta?.content ?? null;
  } catch {
    return null;
  }
}

/** Stream from legacy Lovable Supabase `ai-chat` edge (has LOVABLE_API_KEY server-side). */
export async function streamViaSupabaseAiChatEdge(options: {
  history: VybeAiChatMessage[];
  userText: string;
  context: VybeAiChatContext;
  feedDNA?: boolean;
  onChunk: (delta: string, fullText: string) => void;
}): Promise<string> {
  const { history, userText, context, feedDNA, onChunk } = options;
  const messages = [
    ...filterAiChatHistoryForApi(history).map((m) => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: userText || 'What is in this image?' },
  ];

  const headers = await buildSupabaseEdgeHeaders();
  const response = await fetch(resolveSupabaseAiChatUrl(), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      messages,
      aiName: context.aiName,
      aiPersonality: context.aiPersonality,
      feedDNA,
      location: context.location,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    if (response.status === 401) {
      throw new Error('Sign in to use VYBE AI.');
    }
    throw new Error(body.slice(0, 200) || `AI chat HTTP ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('AI chat returned no stream');

  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      let line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      const delta = parseSseDelta(line);
      if (delta) {
        fullText += delta;
        onChunk(delta, fullText);
      }
    }
  }

  if (!fullText.trim()) {
    throw new Error('VYBE AI returned an empty reply.');
  }
  return fullText.trim();
}
