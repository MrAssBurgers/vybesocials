export interface VybeAiChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const AI_HISTORY_ERROR_RE =
  /invalid-content|First Content should be with role|LOVABLE_API_KEY|GEMINI_API_KEY|^internal$|VYBE AI server failed|VYBE AI could not respond|Sign in to use VYBE AI/i;

/** Drop failed AI error bubbles before they pollute the next Gemini request. */
export function filterAiChatHistoryForApi(messages: VybeAiChatMessage[]): VybeAiChatMessage[] {
  return messages.filter(
    (m) => !(m.role === 'assistant' && AI_HISTORY_ERROR_RE.test(m.content)),
  );
}
