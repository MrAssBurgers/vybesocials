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
  bgGradientMid?: string;
  bgGradientTo?: string;
  glassBg?: string;
  glassBorder?: string;
  sidebarBg?: string;
  navBg?: string;
  inputBg?: string;
  textPrimary: string;
  textSecondary: string;
  borderColor?: string;
  borderRadius: "small" | "medium" | "large";
  mode: "light" | "dark";
  neonPink?: string;
  neonPurple?: string;
  neonCyan?: string;
}

const THEME_PRESETS: Record<string, ThemeTokens> = {
  classic: {
    colorPrimary: "330 100% 60%",
    colorSecondary: "240 10% 12%",
    colorAccent: "185 100% 50%",
    bgMain: "240 10% 4%",
    bgCard: "240 10% 6%",
    bgGradientFrom: "240 10% 4%",
    bgGradientMid: "240 10% 8%",
    bgGradientTo: "240 10% 4%",
    glassBg: "240 10% 10%",
    glassBorder: "240 10% 20%",
    sidebarBg: "240 10% 6%",
    navBg: "240 10% 6%",
    inputBg: "240 10% 18%",
    textPrimary: "0 0% 98%",
    textSecondary: "240 5% 55%",
    borderColor: "240 10% 18%",
    borderRadius: "medium",
    mode: "dark",
    neonPink: "330 100% 60%",
    neonPurple: "280 100% 60%",
    neonCyan: "185 100% 50%",
  },
  midnight: {
    colorPrimary: "220 90% 56%",
    colorSecondary: "230 25% 18%",
    colorAccent: "200 100% 62%",
    bgMain: "230 25% 8%",
    bgCard: "230 20% 14%",
    bgGradientFrom: "230 25% 6%",
    bgGradientMid: "230 30% 12%",
    bgGradientTo: "230 25% 8%",
    glassBg: "230 20% 12%",
    glassBorder: "230 20% 22%",
    sidebarBg: "230 25% 10%",
    navBg: "230 25% 10%",
    inputBg: "230 20% 20%",
    textPrimary: "210 40% 98%",
    textSecondary: "215 20% 65%",
    borderColor: "230 20% 22%",
    borderRadius: "medium",
    mode: "dark",
    neonPink: "220 90% 56%",
    neonPurple: "260 80% 60%",
    neonCyan: "200 100% 62%",
  },
  neon: {
    colorPrimary: "330 100% 60%",
    colorSecondary: "280 100% 50%",
    colorAccent: "160 100% 50%",
    bgMain: "270 50% 6%",
    bgCard: "270 40% 12%",
    bgGradientFrom: "280 60% 4%",
    bgGradientMid: "300 50% 10%",
    bgGradientTo: "260 50% 6%",
    glassBg: "270 40% 15%",
    glassBorder: "280 50% 30%",
    sidebarBg: "270 45% 10%",
    navBg: "270 45% 10%",
    inputBg: "270 35% 18%",
    textPrimary: "0 0% 100%",
    textSecondary: "270 30% 70%",
    borderColor: "280 50% 30%",
    borderRadius: "large",
    mode: "dark",
    neonPink: "330 100% 65%",
    neonPurple: "280 100% 60%",
    neonCyan: "160 100% 50%",
  },
  soft: {
    colorPrimary: "340 65% 55%",
    colorSecondary: "200 50% 85%",
    colorAccent: "160 50% 50%",
    bgMain: "30 30% 96%",
    bgCard: "0 0% 100%",
    bgGradientFrom: "30 30% 98%",
    bgGradientMid: "340 20% 96%",
    bgGradientTo: "30 30% 96%",
    glassBg: "0 0% 100%",
    glassBorder: "240 5% 90%",
    sidebarBg: "0 0% 98%",
    navBg: "0 0% 98%",
    inputBg: "240 5% 92%",
    textPrimary: "240 10% 20%",
    textSecondary: "240 5% 50%",
    borderColor: "240 5% 85%",
    borderRadius: "large",
    mode: "light",
    neonPink: "340 65% 55%",
    neonPurple: "280 50% 60%",
    neonCyan: "160 50% 50%",
  },
  cyberpunk: {
    colorPrimary: "55 100% 50%",
    colorSecondary: "330 100% 50%",
    colorAccent: "180 100% 50%",
    bgMain: "240 20% 4%",
    bgCard: "240 15% 10%",
    bgGradientFrom: "240 25% 3%",
    bgGradientMid: "280 30% 8%",
    bgGradientTo: "240 20% 5%",
    glassBg: "240 20% 12%",
    glassBorder: "55 80% 30%",
    sidebarBg: "240 18% 8%",
    navBg: "240 18% 8%",
    inputBg: "240 15% 16%",
    textPrimary: "55 100% 90%",
    textSecondary: "55 50% 60%",
    borderColor: "55 60% 25%",
    borderRadius: "small",
    mode: "dark",
    neonPink: "330 100% 55%",
    neonPurple: "280 100% 60%",
    neonCyan: "180 100% 50%",
  },
  minimal: {
    colorPrimary: "0 0% 15%",
    colorSecondary: "0 0% 85%",
    colorAccent: "0 0% 40%",
    bgMain: "0 0% 100%",
    bgCard: "0 0% 98%",
    bgGradientFrom: "0 0% 100%",
    bgGradientMid: "0 0% 98%",
    bgGradientTo: "0 0% 100%",
    glassBg: "0 0% 100%",
    glassBorder: "0 0% 90%",
    sidebarBg: "0 0% 98%",
    navBg: "0 0% 98%",
    inputBg: "0 0% 95%",
    textPrimary: "0 0% 10%",
    textSecondary: "0 0% 45%",
    borderColor: "0 0% 88%",
    borderRadius: "small",
    mode: "light",
    neonPink: "0 0% 30%",
    neonPurple: "0 0% 40%",
    neonCyan: "0 0% 50%",
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
Your task is to interpret natural language descriptions and generate COMPLETE, IMMERSIVE color themes that transform the ENTIRE app.

When a user describes something like "ocean vibes", "forest theme", or "pink aesthetic", you MUST change EVERYTHING:
- Main background and gradient backgrounds
- Card and glass surfaces
- Sidebar and navigation colors
- Input field backgrounds
- Border colors
- Accent and highlight colors
- Text colors (while maintaining readability)

The goal is to make the ENTIRE app FEEL like what the user described. Not just change one color - transform the whole experience.

CRITICAL RULES:
1. All colors MUST be in HSL format: "hue saturation% lightness%" (e.g., "262 83% 58%")
2. Ensure text contrast ratios meet WCAG AA (4.5:1 minimum)
3. For dark themes: bgMain 4-15% lightness, text 90-100% lightness
4. For light themes: bgMain 90-100% lightness, text 5-20% lightness
5. borderRadius: "small" (sharp), "medium" (balanced), or "large" (bubbly)
6. Create COHESIVE palettes - all backgrounds should flow together
7. Glass backgrounds should be slightly lighter/more saturated than bgMain
8. Gradient colors should create smooth transitions matching the vibe
9. neonPink, neonPurple, neonCyan are for glows and highlights - match the theme

Example: For "ocean theme" - use deep blues, teals, and aqua accents. ALL backgrounds should be oceanic, not just the primary color.

Base theme: ${JSON.stringify(baseTheme, null, 2)}`;

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
          { role: "user", content: `Transform the ENTIRE app to match: "${prompt}". Change backgrounds, cards, sidebar, inputs, borders - EVERYTHING should match this vibe.` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_theme",
              description: "Generate a complete immersive UI theme",
              parameters: {
                type: "object",
                properties: {
                  colorPrimary: { type: "string", description: "Primary accent color (HSL)" },
                  colorSecondary: { type: "string", description: "Secondary color (HSL)" },
                  colorAccent: { type: "string", description: "Highlight/glow color (HSL)" },
                  bgMain: { type: "string", description: "Main background - dominant color (HSL)" },
                  bgCard: { type: "string", description: "Card/surface background (HSL)" },
                  bgGradientFrom: { type: "string", description: "Gradient start color (HSL)" },
                  bgGradientMid: { type: "string", description: "Gradient middle color (HSL)" },
                  bgGradientTo: { type: "string", description: "Gradient end color (HSL)" },
                  glassBg: { type: "string", description: "Glass effect background (HSL)" },
                  glassBorder: { type: "string", description: "Glass border color (HSL)" },
                  sidebarBg: { type: "string", description: "Sidebar background (HSL)" },
                  navBg: { type: "string", description: "Navigation bar background (HSL)" },
                  inputBg: { type: "string", description: "Input field background (HSL)" },
                  textPrimary: { type: "string", description: "Primary text color (HSL)" },
                  textSecondary: { type: "string", description: "Muted text color (HSL)" },
                  borderColor: { type: "string", description: "Border color (HSL)" },
                  neonPink: { type: "string", description: "Neon glow color 1 (HSL)" },
                  neonPurple: { type: "string", description: "Neon glow color 2 (HSL)" },
                  neonCyan: { type: "string", description: "Neon glow color 3 (HSL)" },
                  borderRadius: { type: "string", enum: ["small", "medium", "large"] },
                  mode: { type: "string", enum: ["light", "dark"] },
                  themeName: { type: "string", description: "Creative 2-3 word theme name" },
                },
                required: [
                  "colorPrimary", "colorSecondary", "colorAccent",
                  "bgMain", "bgCard", "bgGradientFrom", "bgGradientMid", "bgGradientTo",
                  "glassBg", "glassBorder", "sidebarBg", "navBg", "inputBg",
                  "textPrimary", "textSecondary", "borderColor",
                  "neonPink", "neonPurple", "neonCyan",
                  "borderRadius", "mode", "themeName"
                ],
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
          JSON.stringify({ error: "Rate limit exceeded. Please try again." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error("Failed to generate theme");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall?.function?.arguments) {
      throw new Error("Invalid AI response");
    }

    const theme = JSON.parse(toolCall.function.arguments);

    // Sanitize all values
    const sanitizedTheme = {
      colorPrimary: validateHSL(theme.colorPrimary) || baseTheme.colorPrimary,
      colorSecondary: validateHSL(theme.colorSecondary) || baseTheme.colorSecondary,
      colorAccent: validateHSL(theme.colorAccent) || baseTheme.colorAccent,
      bgMain: validateHSL(theme.bgMain) || baseTheme.bgMain,
      bgCard: validateHSL(theme.bgCard) || baseTheme.bgCard,
      bgGradientFrom: validateHSL(theme.bgGradientFrom) || baseTheme.bgGradientFrom,
      bgGradientMid: validateHSL(theme.bgGradientMid) || baseTheme.bgGradientMid,
      bgGradientTo: validateHSL(theme.bgGradientTo) || baseTheme.bgGradientTo,
      glassBg: validateHSL(theme.glassBg) || baseTheme.glassBg,
      glassBorder: validateHSL(theme.glassBorder) || baseTheme.glassBorder,
      sidebarBg: validateHSL(theme.sidebarBg) || baseTheme.sidebarBg,
      navBg: validateHSL(theme.navBg) || baseTheme.navBg,
      inputBg: validateHSL(theme.inputBg) || baseTheme.inputBg,
      textPrimary: validateHSL(theme.textPrimary) || baseTheme.textPrimary,
      textSecondary: validateHSL(theme.textSecondary) || baseTheme.textSecondary,
      borderColor: validateHSL(theme.borderColor) || baseTheme.borderColor,
      neonPink: validateHSL(theme.neonPink) || baseTheme.neonPink,
      neonPurple: validateHSL(theme.neonPurple) || baseTheme.neonPurple,
      neonCyan: validateHSL(theme.neonCyan) || baseTheme.neonCyan,
      borderRadius: ["small", "medium", "large"].includes(theme.borderRadius) 
        ? theme.borderRadius 
        : baseTheme.borderRadius,
      mode: ["light", "dark"].includes(theme.mode) ? theme.mode : baseTheme.mode,
      themeName: theme.themeName || "Custom Theme",
    };

    return new Response(JSON.stringify({ theme: sanitizedTheme }), {
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
  const hslRegex = /^\d{1,3}\s+\d{1,3}%\s+\d{1,3}%$/;
  if (hslRegex.test(value.trim())) {
    return value.trim();
  }
  return null;
}
