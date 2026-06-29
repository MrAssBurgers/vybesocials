import type { Content, Part } from 'firebase/ai';
import { AIError } from 'firebase/ai';
import { getAuth } from 'firebase/auth';
import { getChatModelWithSystem, isAiLogicConfigured } from './aiLogic';
import {
  filterAiChatHistoryForApi,
  type VybeAiChatMessage,
} from './aiChatHistory';
import { getFirebaseApp } from './app';
import { invokeFunction } from './functionsService';
import { isAppCheckTokenVerified } from './appCheck';
import { RATE_LIMITS } from '@/lib/rateLimit';

export type { VybeAiChatMessage } from './aiChatHistory';
export { filterAiChatHistoryForApi } from './aiChatHistory';

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
  /** User has BYOK — server callable uses their key. */
  hasByok?: boolean;
  /** Skip client Firebase AI Logic and call aiChat first. */
  serverFirst?: boolean;
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

function isAppCheckAiError(error: unknown): boolean {
  const msg =
    error instanceof Error
      ? error.message
      : error && typeof error === 'object' && 'message' in error
        ? String((error as { message?: unknown }).message ?? '')
        : String(error ?? '');
  return /app check token is invalid|app-check.*invalid|APP_CHECK/i.test(msg);
}

export function formatFirebaseAiError(error: unknown): string | null {
  if (isAppCheckAiError(error)) {
    return 'VYBE AI security check failed. Retrying via server…';
  }
  if (error && typeof error === 'object' && 'status' in error && (error as { status: number }).status === 429) {
    return 'Too many requests. Wait a moment.';
  }
  if (error instanceof AIError) {
    switch (error.code) {
      case 'api-not-enabled':
        return 'VYBE AI is not enabled yet. In Firebase Console → AI Logic, enable Gemini for your web app (or run `firebase init ailogic`).';
      case 'no-api-key':
      case 'no-app-id':
      case 'no-project-id':
        return 'VYBE AI is not configured. Check Firebase environment variables.';
      case 'fetch-error':
      case 'request-error':
        if (isAppCheckAiError(error)) {
          return 'VYBE AI security check failed. Using server fallback.';
        }
        return 'Could not reach VYBE AI. Check your connection and try again.';
      case 'response-error':
        return error.message || 'VYBE AI blocked or failed this request. Try rephrasing.';
      case 'invalid-content':
        return 'VYBE AI could not read this chat history. Tap Clear Chat and try again.';
      default:
        if (error.message) return error.message;
    }
  }
  if (error instanceof Error) {
    const msg = error.message?.trim();
    if (msg && isAppCheckAiError(error)) {
      return 'VYBE AI security check failed. Using server fallback.';
    }
    if (msg === 'internal') {
      return 'VYBE AI server failed. Set GEMINI_API_KEY and redeploy Cloud Functions.';
    }
    if (msg) return msg;
  }
  if (error && typeof error === 'object') {
    const e = error as { message?: string; name?: string };
    const code = (e.name || '').replace(/^functions\//, '');
    const msg = e.message || '';
    if (code === 'internal' || msg === 'internal') {
      return 'VYBE AI server error. Try Clear Chat, then send again. If it persists, check Cloud Functions logs for aiChat.';
    }
    if (msg && msg !== code) return msg;
  }
  return null;
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
      if (/your api key|invalid.*key|API key not valid|permission denied/i.test(msg)) {
        return 'Your Google AI API key is invalid or restricted. Update it in Settings → VYBE AI.';
      }
      return 'VYBE AI server needs GEMINI_API_KEY on Firebase Cloud Functions, or add your own key in Settings → VYBE AI.';
    }
    if (/invalid.*key|API key not valid|403|401/i.test(msg)) {
      return 'Your Google AI API key is invalid or restricted. Update it in Settings → VYBE AI.';
    }
    if (code === 'resource-exhausted' || /rate limit|daily.*limit|credit|billing|depleted/i.test(msg)) {
      return msg.includes('limit') || /credit|billing|depleted/i.test(msg)
        ? msg
        : 'Too many requests. Wait a moment.';
    }
    if (code === 'unavailable' || code === 'deadline-exceeded') {
      return msg && msg !== code ? msg : 'VYBE AI is temporarily unavailable. Try again in a moment.';
    }
    if (code === 'internal' || msg === 'internal') {
      return 'VYBE AI server error. Try Clear Chat, then send again. If it persists, check Cloud Functions logs for aiChat.';
    }
    if (msg && msg !== code) return msg;
  }
  return 'VYBE AI could not respond. Try again in a moment.';
}

async function ensureSignedInForAi(): Promise<void> {
  const auth = getAuth(getFirebaseApp());
  let user = auth.currentUser;
  if (!user) {
    user = await new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(null), 4000);
      const unsub = auth.onAuthStateChanged((u) => {
        if (u) {
          clearTimeout(timeout);
          unsub();
          resolve(u);
        }
      });
    });
  }
  if (!user) {
    throw new Error('Sign in to use VYBE AI.');
  }
  await user.getIdToken();
}

async function invokeVybeAiChatCallable(
  history: VybeAiChatMessage[],
  userText: string,
  context: VybeAiChatContext,
  imageBase64?: string | null,
  imageMimeType?: string | null,
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
    imageBase64: imageBase64 || undefined,
    imageMimeType: imageMimeType || undefined,
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

function pickUserFacingAiError(errors: unknown[], preferCallable = false): string {
  type Candidate = { formatted: string; score: number };
  const candidates: Candidate[] = [];

  errors.forEach((err, idx) => {
    if (isAppCheckAiError(err)) return;
    const callableMsg = formatCallableAiError(err);
    const clientMsg = formatFirebaseAiError(err);
    const formatted = callableMsg || clientMsg;
    if (!formatted || /retrying via server|using server fallback/i.test(formatted)) return;

    let score = 0;
    if (err && typeof err === 'object') {
      const code = String((err as { name?: string }).name || '').replace(/^functions\//, '');
      if (code && code !== 'internal') score += 12;
      if (code === 'failed-precondition' || code === 'resource-exhausted') score += 20;
    }
    if (/VYBE AI server error\. Try Clear Chat/i.test(formatted)) score -= 8;
    if (formatted.length > 48) score += 6;
    // Callable path is index 0 when server-first, last when client-first.
    const isCallableAttempt = preferCallable
      ? idx === 0
      : idx === errors.length - 1 && errors.length > 1;
    if (isCallableAttempt) score += 18;
    if (callableMsg && callableMsg === formatted) score += 4;

    candidates.push({ formatted, score });
  });

  candidates.sort((a, b) => b.score - a.score);
  if (candidates[0]) return candidates[0].formatted;

  for (const err of errors) {
    const formatted = formatFirebaseAiError(err) || formatCallableAiError(err);
    if (formatted) return formatted;
  }
  return 'VYBE AI could not respond. Try again in a moment.';
}

/**
 * Stream a VYBE AI chat reply — server callable first when BYOK or App Check unverified,
 * otherwise Firebase AI Logic with Cloud Function fallback.
 */
export async function streamVybeAiChat(options: StreamVybeAiChatOptions): Promise<string> {
  if (!RATE_LIMITS.aiChat()) {
    const err = new Error('Too many requests. Wait a moment.');
    Object.assign(err, { status: 429 });
    throw err;
  }

  await ensureSignedInForAi();
  const { history, userText, context, onChunk, imageBase64, imageMimeType, hasByok } = options;
  const errors: unknown[] = [];
  const serverFirst =
    options.serverFirst ?? (hasByok || !isAppCheckTokenVerified());

  const tryCallable = async (): Promise<string> => {
    const reply = await invokeVybeAiChatCallable(
      history,
      userText,
      context,
      imageBase64,
      imageMimeType,
    );
    onChunk(reply, reply);
    return reply;
  };

  const tryClient = async (): Promise<string> => {
    if (!isAiLogicConfigured()) {
      throw new Error('VYBE AI client is not configured.');
    }
    return streamVybeAiChatViaFirebaseAi(options);
  };

  if (serverFirst) {
    try {
      return await tryCallable();
    } catch (callableErr) {
      errors.push(callableErr);
      if (isAiLogicConfigured()) {
        try {
          return await tryClient();
        } catch (clientErr) {
          errors.push(clientErr);
        }
      }
    }
  } else {
    if (isAiLogicConfigured()) {
      try {
        return await tryClient();
      } catch (clientErr) {
        errors.push(clientErr);
      }
    }
    try {
      return await tryCallable();
    } catch (callableErr) {
      errors.push(callableErr);
    }
  }

  throw new Error(pickUserFacingAiError(errors, hasByok || serverFirst));
}

/** Type out a completed reply word-by-word (server responses are not streamed). */
async function revealReplyGradually(
  reply: string,
  onChunk: (delta: string, fullText: string) => void,
): Promise<void> {
  if (!reply) {
    onChunk('', '');
    return;
  }
  const parts = reply.split(/(\s+)/);
  let full = '';
  for (const part of parts) {
    if (!part) continue;
    full += part;
    onChunk(part, full);
    const delay = part.length > 4 ? 22 : part.trim() ? 14 : 6;
    await new Promise((r) => setTimeout(r, delay));
  }
}

const IMAGINE_PREFIX = /^\/imagine\s+/i;

export function parseImaginePrompt(text: string): string | null {
  const match = text.trim().match(IMAGINE_PREFIX);
  if (!match) return null;
  const prompt = text.trim().replace(IMAGINE_PREFIX, '').trim();
  return prompt || null;
}

/** Generate an image via quota-gated Cloud Function (Gemini image model). */
export async function generateVybeAiImage(prompt: string): Promise<string> {
  if (!RATE_LIMITS.aiChat()) {
    throw Object.assign(new Error('Too many requests. Wait a moment.'), { status: 429 });
  }
  await ensureSignedInForAi();
  const { data, error } = await invokeFunction<{ url?: string }>('generate-background', {
    prompt: prompt.slice(0, 500),
  });
  if (error) throw error;
  const url = typeof data?.url === 'string' ? data.url.trim() : '';
  if (!url) throw new Error('No image was generated. Try a different prompt.');
  return url;
}
