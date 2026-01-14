import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ThemeTokens {
  colorPrimary: string;
  colorSecondary: string;
  colorAccent: string;
  bgMain: string;
  bgCard: string;
  bgGradientFrom?: string;
  bgGradientTo?: string;
  sidebarBg?: string;
  navBg?: string;
  inputBg?: string;
  textPrimary: string;
  textSecondary: string;
  borderColor?: string;
  borderRadius: "small" | "medium" | "large";
  mode: "light" | "dark";
}

const THEME_PRESETS: Record<string, ThemeTokens> = {
  classic: {
    colorPrimary: "262 83% 58%",
    colorSecondary: "240 4% 16%",
    colorAccent: "280 100% 70%",
    bgMain: "240 10% 4%",
    bgCard: "240 6% 10%",
    sidebarBg: "240 6% 8%",
    navBg: "240 6% 8%",
    inputBg: "240 4% 16%",
    textPrimary: "0 0% 98%",
    textSecondary: "240 5% 65%",
    borderColor: "240 4% 16%",
    borderRadius: "medium",
    mode: "dark",
  },
  midnight: {
    colorPrimary: "220 90% 56%",
    colorSecondary: "230 25% 18%",
    colorAccent: "200 100% 62%",
    bgMain: "230 25% 8%",
    bgCard: "230 20% 14%",
    sidebarBg: "230 25% 10%",
    navBg: "230 25% 10%",
    inputBg: "230 20% 18%",
    textPrimary: "210 40% 98%",
    textSecondary: "215 20% 65%",
    borderColor: "230 20% 20%",
    borderRadius: "medium",
    mode: "dark",
  },
  neon: {
    colorPrimary: "330 100% 60%",
    colorSecondary: "280 100% 50%",
    colorAccent: "160 100% 50%",
    bgMain: "270 50% 6%",
    bgCard: "270 40% 12%",
    sidebarBg: "270 50% 8%",
    navBg: "270 50% 8%",
    inputBg: "270 40% 16%",
    textPrimary: "0 0% 100%",
    textSecondary: "270 30% 70%",
    borderColor: "270 40% 20%",
    borderRadius: "large",
    mode: "dark",
  },
  soft: {
    colorPrimary: "340 65% 65%",
    colorSecondary: "200 50% 75%",
    colorAccent: "160 50% 60%",
    bgMain: "30 30% 96%",
    bgCard: "0 0% 100%",
    sidebarBg: "30 20% 94%",
    navBg: "0 0% 100%",
    inputBg: "30 20% 92%",
    textPrimary: "240 10% 20%",
    textSecondary: "240 5% 50%",
    borderColor: "30 20% 88%",
    borderRadius: "large",
    mode: "light",
  },
  cyberpunk: {
    colorPrimary: "55 100% 50%",
    colorSecondary: "330 100% 50%",
    colorAccent: "180 100% 50%",
    bgMain: "240 20% 4%",
    bgCard: "240 15% 10%",
    sidebarBg: "240 20% 6%",
    navBg: "240 20% 6%",
    inputBg: "240 15% 14%",
    textPrimary: "55 100% 90%",
    textSecondary: "55 50% 60%",
    borderColor: "55 100% 30%",
    borderRadius: "small",
    mode: "dark",
  },
  minimal: {
    colorPrimary: "0 0% 15%",
    colorSecondary: "0 0% 30%",
    colorAccent: "0 0% 50%",
    bgMain: "0 0% 100%",
    bgCard: "0 0% 98%",
    sidebarBg: "0 0% 96%",
    navBg: "0 0% 100%",
    inputBg: "0 0% 94%",
    textPrimary: "0 0% 10%",
    textSecondary: "0 0% 45%",
    borderColor: "0 0% 90%",
    borderRadius: "small",
    mode: "light",
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, basePreset = "classic" } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const baseTheme = THEME_PRESETS[basePreset] || THEME_PRESETS.classic;

    const systemPrompt = `You are a UI theme designer for a social media app called VYBE. 
Your task is to interpret natural language descriptions and generate COMPLETE, COHESIVE color themes that transform the ENTIRE app appearance.

When a user describes something like "ocean vibes" or "forest theme", you should change EVERYTHING - backgrounds, cards, sidebar, navigation, inputs, borders - to match that aesthetic completely.

IMPORTANT RULES:
1. All colors MUST be in HSL format: "hue saturation% lightness%" (e.g., "262 83% 58%")
2. Ensure text contrast ratios meet WCAG AA standards (4.5:1 for normal text)
3. For dark mode: bgMain lightness should be 4-15%, textPrimary lightness should be 90-100%
4. For light mode: bgMain lightness should be 90-100%, textPrimary lightness should be 5-20%
5. borderRadius must be exactly "small", "medium", or "large"
6. mode must be exactly "light" or "dark"
7. Create a COHESIVE color palette where all elements complement each other
8. Sidebar, nav, cards, and inputs should all follow the same color story
9. Make the theme FEEL like what the user described - don't just change the primary color

Current base theme (${basePreset}):
${JSON.stringify(baseTheme, null, 2)}

Generate a complete theme that FULLY transforms the app to match the user's description.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Create a complete theme transformation based on this description: "${prompt}". Change EVERYTHING - backgrounds, colors, borders, inputs - to match this vibe completely.` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_theme",
              description: "Generate a complete UI theme with all color tokens for full app transformation",
              parameters: {
                type: "object",
                properties: {
                  colorPrimary: {
                    type: "string",
                    description: "Primary brand/accent color in HSL format (e.g., '262 83% 58%')",
                  },
                  colorSecondary: {
                    type: "string",
                    description: "Secondary color for buttons and highlights in HSL format",
                  },
                  colorAccent: {
                    type: "string",
                    description: "Accent/glow color for special elements in HSL format",
                  },
                  bgMain: {
                    type: "string",
                    description: "Main app background color in HSL format - this is the dominant background",
                  },
                  bgCard: {
                    type: "string",
                    description: "Card/elevated surface background color in HSL format",
                  },
                  sidebarBg: {
                    type: "string",
                    description: "Sidebar background color in HSL format",
                  },
                  navBg: {
                    type: "string",
                    description: "Navigation bar background color in HSL format",
                  },
                  inputBg: {
                    type: "string",
                    description: "Input field background color in HSL format",
                  },
                  textPrimary: {
                    type: "string",
                    description: "Primary text color in HSL format - must contrast with bgMain",
                  },
                  textSecondary: {
                    type: "string",
                    description: "Secondary/muted text color in HSL format",
                  },
                  borderColor: {
                    type: "string",
                    description: "Border color for cards and inputs in HSL format",
                  },
                  borderRadius: {
                    type: "string",
                    enum: ["small", "medium", "large"],
                    description: "Border radius preset - small for sharp, large for bubbly",
                  },
                  mode: {
                    type: "string",
                    enum: ["light", "dark"],
                    description: "Light or dark mode - choose based on the vibe described",
                  },
                  themeName: {
                    type: "string",
                    description: "A short, creative name for this theme (2-3 words)",
                  },
                },
                required: [
                  "colorPrimary",
                  "colorSecondary",
                  "colorAccent",
                  "bgMain",
                  "bgCard",
                  "sidebarBg",
                  "navBg",
                  "inputBg",
                  "textPrimary",
                  "textSecondary",
                  "borderColor",
                  "borderRadius",
                  "mode",
                  "themeName",
                ],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_theme" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add funds to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("Failed to generate theme");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall?.function?.arguments) {
      throw new Error("Invalid response from AI");
    }

    const theme = JSON.parse(toolCall.function.arguments) as ThemeTokens & { themeName: string };

    // Validate and sanitize the theme
    const sanitizedTheme: ThemeTokens & { themeName: string } = {
      colorPrimary: validateHSL(theme.colorPrimary) || baseTheme.colorPrimary,
      colorSecondary: validateHSL(theme.colorSecondary) || baseTheme.colorSecondary,
      colorAccent: validateHSL(theme.colorAccent) || baseTheme.colorAccent,
      bgMain: validateHSL(theme.bgMain) || baseTheme.bgMain,
      bgCard: validateHSL(theme.bgCard) || baseTheme.bgCard,
      sidebarBg: validateHSL(theme.sidebarBg || "") || baseTheme.sidebarBg,
      navBg: validateHSL(theme.navBg || "") || baseTheme.navBg,
      inputBg: validateHSL(theme.inputBg || "") || baseTheme.inputBg,
      textPrimary: validateHSL(theme.textPrimary) || baseTheme.textPrimary,
      textSecondary: validateHSL(theme.textSecondary) || baseTheme.textSecondary,
      borderColor: validateHSL(theme.borderColor || "") || baseTheme.borderColor,
      borderRadius: ["small", "medium", "large"].includes(theme.borderRadius) 
        ? theme.borderRadius 
        : baseTheme.borderRadius,
      mode: ["light", "dark"].includes(theme.mode) ? theme.mode : baseTheme.mode,
      themeName: theme.themeName || "Custom Theme",
    };

    return new Response(JSON.stringify({ theme: sanitizedTheme, presets: THEME_PRESETS }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("generate-theme error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function validateHSL(value: string): string | null {
  if (!value || typeof value !== "string") return null;
  // Match HSL format: "hue saturation% lightness%"
  const hslRegex = /^\d{1,3}\s+\d{1,3}%\s+\d{1,3}%$/;
  if (hslRegex.test(value.trim())) {
    return value.trim();
  }
  return null;
}
