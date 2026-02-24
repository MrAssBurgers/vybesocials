// Shared xAI Grok API helper for all AI edge functions

const XAI_API_URL = "https://api.x.ai/v1/chat/completions";

// Model mapping
export const GROQ_MODELS = {
  // Primary models
  fast: "grok-3-mini-fast",           // For simple tasks (smart replies, error analysis)
  balanced: "grok-3-mini",            // For most tasks (chat, captions, moderation)
  reasoning: "grok-3",                // For complex tasks (themes, recommendations)
} as const;

export function getGroqApiKey(): string {
  const key = Deno.env.get("XAI_API_KEY");
  if (!key) {
    throw new Error("XAI_API_KEY is not configured");
  }
  return key;
}

export function getGroqHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

export async function callGroq(
  apiKey: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetch(XAI_API_URL, {
    method: "POST",
    headers: getGroqHeaders(apiKey),
    body: JSON.stringify(body),
  });
}

export { XAI_API_URL, XAI_API_URL as GROQ_API_URL };
