const AGENT_AUTH_FAIL_KEY = 'vybe-agent-auth-fail-ts';
const AGENT_SKIP_MS = 30 * 60_000;

const GREETING_RE =
  /^(yo|hi|hey|hello|sup|hiya|howdy|what'?s up|wyd|gm|gn|thanks|thank you|ok|okay|cool|nice)[!.?\s]*$/i;

/** Record agent 401 so we skip vybe-agent and go straight to ai-chat for a while. */
export function recordAgentAuthFailure(): void {
  try {
    sessionStorage.setItem(AGENT_AUTH_FAIL_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function shouldSkipAgentDueToAuth(): boolean {
  try {
    const raw = sessionStorage.getItem(AGENT_AUTH_FAIL_KEY);
    if (!raw) return false;
    return Date.now() - Number(raw) < AGENT_SKIP_MS;
  } catch {
    return false;
  }
}

export function clearAgentAuthFailure(): void {
  try {
    sessionStorage.removeItem(AGENT_AUTH_FAIL_KEY);
  } catch {
    /* ignore */
  }
}

/** Prefer streaming ai-chat over vybe-agent for fast casual replies. */
export function shouldPreferAiChatDirect(
  text: string,
  priorUserMessageCount: number,
): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (GREETING_RE.test(trimmed)) return true;
  if (priorUserMessageCount === 0 && trimmed.length <= 80) return true;
  return false;
}

/** Strip leading emoji / symbols so quick-prompt chips match typed equivalents. */
export function stripLeadingEmojiForAgent(text: string): string {
  return text.replace(/^[\s\p{Extended_Pictographic}]+/u, '').trim();
}

/** Only call vybe-agent edge fn when the user wants app control (not casual chat). */
export function messageWantsCloudAgent(text: string): boolean {
  const t = stripLeadingEmojiForAgent(text).toLowerCase();
  if (!t) return false;
  return /\b(open|go to|show me|take me|navigate|switch to|apply|theme|widget|hide|show|reorder|dark mode|minimal|midnight|neon)\b/.test(t);
}
