// Shared Groq API helper for all AI edge functions
// Replaces Lovable AI Gateway with Groq

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

// Model mapping
export const GROQ_MODELS = {
  // Primary models
  fast: "llama-3.1-8b-instant",        // For simple tasks (smart replies, error analysis)
  balanced: "llama-3.3-70b-versatile",  // For most tasks (chat, captions, moderation)
  reasoning: "llama-3.3-70b-versatile", // For complex tasks (themes, recommendations)
} as const;

export function getGroqApiKey(): string {
  const key = Deno.env.get("GROQ_API_KEY");
  if (!key) {
    throw new Error("GROQ_API_KEY is not configured");
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
  return fetch(GROQ_API_URL, {
    method: "POST",
    headers: getGroqHeaders(apiKey),
    body: JSON.stringify(body),
  });
}

export { GROQ_API_URL };
