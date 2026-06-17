import type { Content, Part } from 'firebase/ai';
import { AIError } from 'firebase/ai';
import { getChatModelWithSystem } from './aiLogic';
import { isAppCheckInitialized } from './appCheck';
import { firebaseAuth } from './authService';
import { invokeFunction } from './functionsService';
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

const AI_HISTORY_ERROR_RE =
  /invalid-content|First Content should be with role|LOVABLE_API_KEY|GEMINI_API_KEY|^internal$/i;

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

function isClientAiTransportError(error: unknown): boolean {
  if (error instanceof AIError) {
    return (
      error.code === 'fetch-error' ||
      error.code === 'request-error' ||
      error.code === 'api-not-enabled' ||
      error.code === 'response-error'
    );
  }
  if (error instanceof Error) {
    return /fetch-error|request-error|PERMISSION_DENIED|API key not valid|Failed to fetch/i.test(
      error.message,
    );
  }
  return false;
}

/** Client Gemini needs App Check when Firebase enforces it — use Cloud Function for text chat until configured. */
function shouldUseServerAiChat(imageBase64?: string | null): boolean {
  return !imageBase64 && !isAppCheckInitialized();
}

function formatCallableAiError(error: unknown): string {
  if (error && typeof error === 'object') {
    const e = error as { message?: string; name?: string };
    const code = (e.name || '').replace(/^functions\//, '');
    const msg = e.message || '';

    if (code === 'not_yet_ported' || msg === 'not_yet_ported') {
      return 'VYBE AI Cloud Function is not deployed yet. Run firebase deploy --only functions:aiChat.';
    }
    if (code === 'unauthenticated' || /unauthenticated|Sign in required|Not authenticated/i.test(msg)) {
      return 'Sign in to use VYBE AI.';
    }
    if (
      code === 'failed-precondition' ||
      /LOVABLE_API_KEY|GEMINI_API_KEY|not configured/i.test(msg)
    ) {
      return 'VYBE AI server needs LOVABLE_API_KEY or GEMINI_API_KEY on Firebase Cloud Functions.';
    }
    if (code === 'resource-exhausted' || /rate limit/i.test(msg)) {
      return 'Too many requests. Wait a moment.';
    }
    if (code === 'internal' || msg === 'internal') {
      return 'VYBE AI server failed. Set LOVABLE_API_KEY or GEMINI_API_KEY and redeploy functions:aiChat.';
    }
    if (msg && msg !== code) return msg;
  }
  return 'VYBE AI could not respond. Try again in a moment.';
}

async function ensureSignedInForAi(): Promise<void> {
  const { data: { session } } = await firebaseAuth.getSession();
  if (!session?.access_token) {
    throw new Error('Sign in to use VYBE AI.');
  }
}

async function invokeVybeAiChatCallable(
  history: VybeAiChatMessage[],
  userText: string,
  context: VybeAiChatContext,
): Promise<string> {
  await ensureSignedInForAi();

  const messages = [
    ...filterAiChatHistoryForApi(history).map((m) => ({
      role: m.role,
      content: m.content,
    })),
    { role: 'user' as const, content: userText || 'What is in this image?' },
  ];

  const { data, error } = await invokeFunction<{ reply?: string }>('ai-chat', {
    messages,
    aiName: context.aiName,
    aiPersonality: context.aiPersonality,
    feedDNA: context.feedDNA,
    location: context.location,
  });

  if (error) throw error;
  const reply = typeof data?.reply === 'string' ? data.reply.trim() : '';
  if (!reply) throw new Error('VYBE AI returned an empty reply.');
  return reply;
}

async function streamVybeAiChatViaFirebaseAi(
  options: StreamVybeAiChatOptions,
): Promise<string> {
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

/**
 * Stream a VYBE AI chat reply via Firebase AI Logic (Gemini Developer API proxy).
 */
export async function streamVybeAiChat(options: StreamVybeAiChatOptions): Promise<string> {
  if (!RATE_LIMITS.aiChat()) {
    const err = new Error('Too many requests. Wait a moment.');
    Object.assign(err, { status: 429 });
    throw err;
  }

  const { history, userText, context, onChunk, imageBase64 } = options;

  // Lovable preview / dev: no App Check site key → try server aiChat first, then client Gemini.
  if (shouldUseServerAiChat(imageBase64)) {
    try {
      const reply = await invokeVybeAiChatCallable(history, userText, context);
      onChunk(reply, reply);
      return reply;
    } catch (callableErr) {
      console.warn('[VYBE AI] Server aiChat failed — trying client Gemini', callableErr);
      try {
        return await streamVybeAiChatViaFirebaseAi(options);
      } catch (clientErr) {
        const formatted =
          formatCallableAiError(callableErr) ||
          formatFirebaseAiError(clientErr) ||
          'VYBE AI could not respond. Try again in a moment.';
        throw new Error(formatted);
      }
    }
  }

  try {
    return await streamVybeAiChatViaFirebaseAi(options);
  } catch (clientErr) {
    if (imageBase64 || !isClientAiTransportError(clientErr)) {
      const formatted = formatFirebaseAiError(clientErr);
      if (formatted) throw new Error(formatted);
      throw clientErr;
    }

    console.warn('[VYBE AI] Client Gemini unavailable — using Cloud Function fallback', clientErr);
    try {
      const reply = await invokeVybeAiChatCallable(history, userText, context);
      onChunk(reply, reply);
      return reply;
    } catch (callableErr) {
      const formatted =
        formatCallableAiError(callableErr) ||
        formatFirebaseAiError(clientErr) ||
        formatFirebaseAiError(callableErr);
      if (formatted) throw new Error(formatted);
      throw callableErr;
    }
  }
}
