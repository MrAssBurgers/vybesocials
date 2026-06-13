/** Resolve Lovable gateway or direct Gemini for edge AI functions. */
export function resolveChatGateway(): {
  apiKey: string;
  url: string;
  model: string;
} | null {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (lovableKey) {
    return {
      apiKey: lovableKey,
      url: "https://ai.gateway.lovable.dev/v1/chat/completions",
      model: "google/gemini-2.5-flash",
    };
  }
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (geminiKey) {
    return {
      apiKey: geminiKey,
      url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      model: "gemini-2.5-flash",
    };
  }
  return null;
}
