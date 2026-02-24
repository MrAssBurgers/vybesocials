import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { validateAuth } from "../_shared/auth.ts";
import { validateAndSanitizeInput, validateMessages, MAX_LENGTHS, wrapWithSafetyContext } from "../_shared/validation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type AIAssistAction = 'rewrite' | 'shorter' | 'friendlier' | 'fix_grammar' | 'suggest_reply';

const SYSTEM_PROMPTS: Record<AIAssistAction, string> = {
  rewrite: "You are a helpful writing assistant. Rewrite the given text to be clearer and more natural while keeping the same meaning. Return only the rewritten text.",
  shorter: "You are a helpful writing assistant. Make the given text shorter and more concise while keeping the key message. Return only the shortened text.",
  friendlier: "You are a helpful writing assistant. Rewrite the given text to sound warmer and more friendly. Return only the friendlier text.",
  fix_grammar: "You are a helpful writing assistant. Fix any grammar, spelling, or punctuation errors in the text. Return only the corrected text.",
  suggest_reply: "You are a helpful assistant. Based on the conversation context, suggest a short, casual, and natural reply. Keep it under 20 words. Return only the suggested reply text.",
};

const VALID_ACTIONS: AIAssistAction[] = ['rewrite', 'shorter', 'friendlier', 'fix_grammar', 'suggest_reply'];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate authentication
    const auth = await validateAuth(req);
    if (!auth.authenticated) {
      return new Response(
        JSON.stringify({ error: auth.error }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action, text, context } = await req.json() as {
      action: unknown;
      text: unknown;
      context?: unknown;
    };

    // Validate action
    if (!action || typeof action !== 'string' || !VALID_ACTIONS.includes(action as AIAssistAction)) {
      return new Response(
        JSON.stringify({ error: "Invalid action. Allowed: " + VALID_ACTIONS.join(', ') }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const validAction = action as AIAssistAction;

    const XAI_API_KEY = Deno.env.get("XAI_API_KEY");
    if (!XAI_API_KEY) {
      throw new Error("XAI_API_KEY is not configured");
    }

    // Build messages based on action type
    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: SYSTEM_PROMPTS[validAction] },
    ];

    if (validAction === 'suggest_reply' && context) {
      // Validate context messages
      const contextValidation = validateMessages(context, 20, 500);
      if (!contextValidation.valid) {
        return new Response(
          JSON.stringify({ error: contextValidation.error }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      const contextContent = contextValidation.sanitizedMessages!
        .map(c => c.content)
        .join('\n');
      
      messages.push({
        role: "user",
        content: wrapWithSafetyContext(
          contextContent,
          "Suggest a natural reply to this conversation"
        ),
      });
    } else {
      // Validate text input
      const textValidation = validateAndSanitizeInput(text, MAX_LENGTHS.text);
      if (!textValidation.valid) {
        return new Response(
          JSON.stringify({ error: textValidation.error }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      messages.push({ 
        role: "user", 
        content: wrapWithSafetyContext(textValidation.sanitized!, `Perform action: ${validAction}`) 
      });
    }

    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${XAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-3-mini",
        messages,
        max_tokens: 200,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const result = data.choices?.[0]?.message?.content?.trim() || "";

    return new Response(
      JSON.stringify({ result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("AI Message Assist error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
