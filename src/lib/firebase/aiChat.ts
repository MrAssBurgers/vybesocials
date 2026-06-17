import type { Content, Part } from 'firebase/ai';
import { AIError } from 'firebase/ai';
import { getChatModelWithSystem } from './aiLogic';
import { RATE_LIMITS } from '@/lib/rateLimit';

export interface VybeAiChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface VybeAiChatContext {
  aiName: string;
  aiPersonality: string;
  feedDNA?: boolean;
  location?: { lat: number; lng: number; city?: string } | null;
}

export interface StreamVybeAiChatOptions {
  history: VybeAiChatMessage[];
  userText: string;
  imageBase64?: string | null;
  imageMimeType?: string | null;
  context: VybeAiChatContext;
  onChunk: (delta: string, fullText: string) => void;
  streamDeadlineMs?: number;
  idleMs?: number;
}

function buildSystemInstruction(ctx: VybeAiChatContext): string {
  const lines = [
    `You are ${ctx.aiName}, the AI assistant built into the VYBE social app.`,
    ctx.aiPersonality,
    'Be concise, warm, and helpful. Use markdown when it improves readability.',
    'You are in chat mode — you cannot change app settings here. If the user wants to open Messages or change their theme, suggest they ask using phrases like "open my messages" or "make my app dark".',
  ];
  if (ctx.feedDNA) {
    lines.push(
      'The user has Vybe DNA personalization on — tailor creative and growth advice to their social creator context.',
    );
  }
  if (ctx.location?.city) {
    lines.push(`Location context: near ${ctx.location.city} (${ctx.location.lat.toFixed(2)}, ${ctx.location.lng.toFixed(2)}).`);
  } else if (ctx.location) {
    lines.push(`Location context: ${ctx.location.lat.toFixed(2)}, ${ctx.location.lng.toFixed(2)}.`);
  }
  return lines.join('\n\n');
}

const AI_HISTORY_ERROR_RE = /invalid-content|First Content should be with role/i;

/** Drop failed AI error bubbles before they pollute the next Gemini request. */
export function filterAiChatHistoryForApi(messages: VybeAiChatMessage[]): VybeAiChatMessage[] {
  return messages.filter(
    (m) => !(m.role === 'assistant' && AI_HISTORY_ERROR_RE.test(m.content)),
  );
}

/**
 * Gemini chat history must start with `user` and alternate user/model.
 * UI may open with an assistant greeting or have consecutive same-role turns — normalize here.
 */
export function toGeminiHistory(messages: VybeAiChatMessage[]): Content[] {
  const mapped = messages
    .filter((m) => m.content.trim())
    .slice(-24)
    .map((m) => ({
      role: (m.role === 'assistant' ? 'model' : 'user') as 'user' | 'model',
      parts: [{ text: m.content }],
    }));

  // Drop leading assistant/model turns (e.g. welcome bubble before first user message).
  let start = 0;
  while (start < mapped.length && mapped[start].role === 'model') {
    start += 1;
  }
  const sliced = mapped.slice(start);

  const normalized: Content[] = [];
  for (const turn of sliced) {
    const prev = normalized[normalized.length - 1];
    if (prev && prev.role === turn.role) {
      const a = prev.parts[0]?.text ?? '';
      const b = turn.parts[0]?.text ?? '';
      prev.parts = [{ text: `${a}\n\n${b}` }];
    } else {
      normalized.push({ role: turn.role, parts: [{ text: turn.parts[0]?.text ?? '' }] });
    }
  }

  // If the last history turn is user, the upcoming sendMessage is also user — drop trailing user.
  while (normalized.length > 0 && normalized[normalized.length - 1].role === 'user') {
    normalized.pop();
  }

  return normalized;
}

function buildUserParts(
  text: string,
  imageBase64?: string | null,
  imageMimeType?: string | null,
): Part[] {
  const parts: Part[] = [];
  const prompt = text.trim() || 'What is in this image? Describe it helpfully.';
  parts.push({ text: prompt });
  if (imageBase64 && imageMimeType) {
    parts.push({
      inlineData: { data: imageBase64, mimeType: imageMimeType },
    });
  }
  return parts;
}

function buildGeminiContents(
  history: VybeAiChatMessage[],
  userText: string,
  imageBase64?: string | null,
  imageMimeType?: string | null,
): Content[] {
  const contents: Content[] = [
    ...toGeminiHistory(filterAiChatHistoryForApi(history)),
    { role: 'user', parts: buildUserParts(userText, imageBase64, imageMimeType) },
  ];

  while (contents.length > 0 && contents[0].role !== 'user') {
    contents.shift();
  }

  return contents;
}

function appendStreamText(fullText: string, raw: string): string {
  if (!raw) return fullText;
  if (fullText && raw.startsWith(fullText)) return raw;
  return fullText + raw;
}

export function formatFirebaseAiError(error: unknown): string | null {
  if (error && typeof error === 'object' && 'status' in error && (error as { status: number }).status === 429) {
    return 'Too many requests. Wait a moment.';
  }
  if (error instanceof AIError) {
    switch (error.code) {
      case 'api-not-enabled':
        return 'VYBE AI is not enabled yet. Run Firebase AI Logic setup in the Firebase console.';
      case 'no-api-key':
      case 'no-app-id':
      case 'no-project-id':
        return 'VYBE AI is not configured. Check Firebase environment variables.';
      case 'fetch-error':
      case 'request-error':
        return 'Could not reach VYBE AI. Check your connection and try again.';
      case 'response-error':
        return error.message || 'VYBE AI blocked or failed this request. Try rephrasing.';
      case 'invalid-content':
        return 'VYBE AI could not read this chat history. Tap Clear Chat and try again.';
      default:
        if (error.message) return error.message;
    }
  }
  return null;
}

/**
 * Stream a VYBE AI chat reply via Firebase AI Logic (Gemini Developer API proxy).
 */
export async function streamVybeAiChat(options: StreamVybeAiChatOptions): Promise<string> {
  if (!RATE_LIMITS.aiChat()) {
    const err = new Error('Too many requests. Wait a moment.');
    Object.assign(err, { status: 429 });
    throw err;
  }

  const {
    history,
    userText,
    imageBase64,
    imageMimeType,
    context,
    onChunk,
    streamDeadlineMs = 90_000,
    idleMs = 15_000,
  } = options;

  const model = getChatModelWithSystem(buildSystemInstruction(context));
  const contents = buildGeminiContents(history, userText, imageBase64, imageMimeType);
  const result = await model.generateContentStream({ contents });

  let fullText = '';
  const deadline = Date.now() + streamDeadlineMs;
  let lastActivity = Date.now();

  for await (const chunk of result.stream) {
    if (Date.now() > deadline) {
      throw Object.assign(new Error('Stream read timed out'), { name: 'AbortError' });
    }
    if (!fullText && Date.now() - lastActivity > idleMs) {
      throw Object.assign(new Error('Stream read timed out waiting for first chunk'), {
        name: 'AbortError',
      });
    }

    let raw = '';
    try {
      raw = chunk.text();
    } catch {
      continue;
    }
    if (!raw) continue;

    const prev = fullText;
    fullText = appendStreamText(fullText, raw);
    lastActivity = Date.now();
    onChunk(fullText.slice(prev.length) || raw, fullText);
  }

  if (!fullText.trim()) {
    try {
      const aggregated = await result.response;
      fullText = aggregated.text();
      if (fullText) onChunk(fullText, fullText);
    } catch (err) {
      const formatted = formatFirebaseAiError(err);
      if (formatted) throw new Error(formatted);
      throw err;
    }
  }

  return fullText.trim();
}
