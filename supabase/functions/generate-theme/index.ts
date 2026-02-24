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
  inputText?: string;
  buttonText?: string;
  textPrimary: string;
  textSecondary: string;
  borderColor?: string;
  borderRadius: "small" | "medium" | "large";
  mode: "light" | "dark";
  neonPink?: string;
  neonPurple?: string;
  neonCyan?: string;
  animationSpeed?: "slow" | "normal" | "fast" | "instant";
  animationStyle?: "smooth" | "bouncy" | "snappy" | "none";
  // Background image and effects
  backgroundImage?: string;
  backgroundEffect?: "none" | "particles" | "stars" | "bubbles" | "aurora" | "rain" | "snow" | "fireflies" | "geometric";
  backgroundOverlay?: string;
  backgroundBlur?: number;
  backgroundOpacity?: number;
}

// Helper to parse HSL and calculate relative luminance for contrast checking
function parseHSL(hsl: string): { h: number; s: number; l: number } | null {
  if (!hsl) return null;
  const match = hsl.match(/^(\d+)\s+(\d+)%\s+(\d+)%$/);
  if (!match) return null;
  return { h: parseInt(match[1]), s: parseInt(match[2]), l: parseInt(match[3]) };
}

// Ensure proper contrast by adjusting text lightness if needed
function ensureContrast(bgHSL: string, textHSL: string, mode: "light" | "dark"): string {
  const bg = parseHSL(bgHSL);
  const text = parseHSL(textHSL);
  if (!bg || !text) return textHSL;
  
  // For dark mode: text should be light (high lightness)
  // For light mode: text should be dark (low lightness)
  const bgLightness = bg.l;
  let textLightness = text.l;
  
  // Calculate contrast difference
  const diff = Math.abs(bgLightness - textLightness);
  
  // If contrast is too low (less than 50% difference), adjust text
  if (diff < 50) {
    if (mode === "dark") {
      // Make text lighter for dark backgrounds
      textLightness = Math.min(98, bgLightness + 60);
    } else {
      // Make text darker for light backgrounds
      textLightness = Math.max(5, bgLightness - 60);
    }
    return `${text.h} ${text.s}% ${textLightness}%`;
  }
  
  return textHSL;
}

// Derive input text color based on input background
function deriveInputTextColor(inputBgHSL: string, mode: "light" | "dark"): string {
  const bg = parseHSL(inputBgHSL);
  if (!bg) return mode === "dark" ? "0 0% 98%" : "0 0% 10%";
  
  // For input fields, we want high contrast text
  if (mode === "dark" || bg.l < 50) {
    // Light text for dark inputs
    return `${bg.h} ${Math.max(0, bg.s - 30)}% 95%`;
  } else {
    // Dark text for light inputs
    return `${bg.h} ${Math.max(0, bg.s - 20)}% 10%`;
  }
}

// Derive button text color based on primary color
function deriveButtonTextColor(primaryHSL: string): string {
  const primary = parseHSL(primaryHSL);
  if (!primary) return "0 0% 98%";
  
  // If primary is bright (high lightness or high saturation with mid lightness), use dark text
  // Otherwise use light text
  if (primary.l > 55 || (primary.s > 70 && primary.l > 40)) {
    return `${primary.h} ${Math.max(0, primary.s - 40)}% 10%`;
  } else {
    return "0 0% 98%";
  }
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

// Background image URLs for different moods
const BACKGROUND_IMAGES: Record<string, string[]> = {
  ocean: [
    "https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=1920&q=80",
    "https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=1920&q=80",
  ],
  space: [
    "https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=1920&q=80",
    "https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=1920&q=80",
  ],
  forest: [
    "https://images.unsplash.com/photo-1448375240586-882707db888b?w=1920&q=80",
    "https://images.unsplash.com/photo-1502082553048-f009c37129b9?w=1920&q=80",
  ],
  sunset: [
    "https://images.unsplash.com/photo-1495344517868-8ebaf0a2044a?w=1920&q=80",
    "https://images.unsplash.com/photo-1472120435266-53107fd0c44a?w=1920&q=80",
  ],
  city: [
    "https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=1920&q=80",
    "https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=1920&q=80",
  ],
  mountains: [
    "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1920&q=80",
    "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&q=80",
  ],
  aurora: [
    "https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=1920&q=80",
    "https://images.unsplash.com/photo-1483347756197-71ef80e95f73?w=1920&q=80",
  ],
  flowers: [
    "https://images.unsplash.com/photo-1490750967868-88aa4486c946?w=1920&q=80",
    "https://images.unsplash.com/photo-1518882605630-8df77e4bf24f?w=1920&q=80",
  ],
  abstract: [
    "https://images.unsplash.com/photo-1557672172-298e090bd0f1?w=1920&q=80",
    "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1920&q=80",
  ],
  neon: [
    "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=1920&q=80",
    "https://images.unsplash.com/photo-1550684376-efcbd6e3f031?w=1920&q=80",
  ],
};

function getBackgroundForMood(prompt: string): { image?: string; effect?: string } {
  const lowerPrompt = prompt.toLowerCase();
  
  // Check for mood keywords and assign backgrounds/effects
  if (lowerPrompt.includes("ocean") || lowerPrompt.includes("sea") || lowerPrompt.includes("water") || lowerPrompt.includes("beach")) {
    return { image: BACKGROUND_IMAGES.ocean[Math.floor(Math.random() * BACKGROUND_IMAGES.ocean.length)], effect: "bubbles" };
  }
  if (lowerPrompt.includes("space") || lowerPrompt.includes("galaxy") || lowerPrompt.includes("cosmic") || lowerPrompt.includes("star")) {
    return { image: BACKGROUND_IMAGES.space[Math.floor(Math.random() * BACKGROUND_IMAGES.space.length)], effect: "stars" };
  }
  if (lowerPrompt.includes("forest") || lowerPrompt.includes("nature") || lowerPrompt.includes("tree") || lowerPrompt.includes("green")) {
    return { image: BACKGROUND_IMAGES.forest[Math.floor(Math.random() * BACKGROUND_IMAGES.forest.length)], effect: "fireflies" };
  }
  if (lowerPrompt.includes("sunset") || lowerPrompt.includes("sunrise") || lowerPrompt.includes("golden")) {
    return { image: BACKGROUND_IMAGES.sunset[Math.floor(Math.random() * BACKGROUND_IMAGES.sunset.length)], effect: "particles" };
  }
  if (lowerPrompt.includes("city") || lowerPrompt.includes("urban") || lowerPrompt.includes("night") || lowerPrompt.includes("cyberpunk")) {
    return { image: BACKGROUND_IMAGES.city[Math.floor(Math.random() * BACKGROUND_IMAGES.city.length)], effect: "geometric" };
  }
  if (lowerPrompt.includes("mountain") || lowerPrompt.includes("alpine") || lowerPrompt.includes("snow")) {
    return { image: BACKGROUND_IMAGES.mountains[Math.floor(Math.random() * BACKGROUND_IMAGES.mountains.length)], effect: "snow" };
  }
  if (lowerPrompt.includes("aurora") || lowerPrompt.includes("northern lights")) {
    return { image: BACKGROUND_IMAGES.aurora[Math.floor(Math.random() * BACKGROUND_IMAGES.aurora.length)], effect: "aurora" };
  }
  if (lowerPrompt.includes("flower") || lowerPrompt.includes("floral") || lowerPrompt.includes("garden") || lowerPrompt.includes("spring")) {
    return { image: BACKGROUND_IMAGES.flowers[Math.floor(Math.random() * BACKGROUND_IMAGES.flowers.length)], effect: "particles" };
  }
  if (lowerPrompt.includes("abstract") || lowerPrompt.includes("art") || lowerPrompt.includes("creative")) {
    return { image: BACKGROUND_IMAGES.abstract[Math.floor(Math.random() * BACKGROUND_IMAGES.abstract.length)], effect: "geometric" };
  }
  if (lowerPrompt.includes("neon") || lowerPrompt.includes("glow") || lowerPrompt.includes("electric")) {
    return { image: BACKGROUND_IMAGES.neon[Math.floor(Math.random() * BACKGROUND_IMAGES.neon.length)], effect: "particles" };
  }
  if (lowerPrompt.includes("rain") || lowerPrompt.includes("storm")) {
    return { effect: "rain" };
  }
  if (lowerPrompt.includes("winter") || lowerPrompt.includes("christmas") || lowerPrompt.includes("cold")) {
    return { effect: "snow" };
  }
  
  return {};
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, basePreset = "classic" } = await req.json();
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    
    if (!GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY is not configured");
    }

    const baseTheme = THEME_PRESETS[basePreset] || THEME_PRESETS.classic;
    
    // Get background suggestion based on prompt
    const bgSuggestion = getBackgroundForMood(prompt);

    const systemPrompt = `You are a UI theme designer for a social media app called VYBE. 
Your task is to interpret natural language descriptions and generate COMPLETE, IMMERSIVE color themes AND animation settings that transform the ENTIRE app.

When a user describes something like "ocean vibes", "forest theme", or "pink aesthetic", you MUST change EVERYTHING:
- Main background and gradient backgrounds
- Card and glass surfaces
- Sidebar and navigation colors
- Input field backgrounds WITH PROPER TEXT CONTRAST
- Border colors
- Accent and highlight colors
- Text colors (while maintaining readability)
- Animation speed and style that matches the mood
- Background effects that enhance the atmosphere

ANIMATION RULES:
- animationSpeed: "slow" for calm/relaxed vibes, "normal" for balanced, "fast" for energetic, "instant" for snappy/tech
- animationStyle: "smooth" for elegant, "bouncy" for playful, "snappy" for modern/tech, "none" for minimal
- Match animations to the mood: ocean/calm = slow+smooth, cyberpunk = fast+snappy, cute/playful = normal+bouncy

BACKGROUND EFFECTS (choose ONE that matches the vibe):
- "none" - no effect (minimal themes)
- "particles" - floating particles (general ambient)
- "stars" - twinkling stars (space/night themes)
- "bubbles" - floating bubbles (ocean/water themes)
- "aurora" - northern lights effect (ethereal themes)
- "rain" - rain drops (moody/rainy themes)
- "snow" - snowflakes (winter/cold themes)
- "fireflies" - glowing fireflies (nature/forest themes)
- "geometric" - geometric shapes (modern/tech themes)

CRITICAL CONTRAST RULES - MUST FOLLOW:
1. All colors MUST be in HSL format: "hue saturation% lightness%" (e.g., "262 83% 58%")
2. TEXT CONTRAST IS CRITICAL: Ensure minimum 4.5:1 contrast ratio (WCAG AA)
3. For dark themes (mode: "dark"):
   - bgMain: 4-15% lightness
   - inputBg: 10-25% lightness (slightly lighter than bgMain for visibility)
   - textPrimary: 90-100% lightness (MUST contrast with ALL backgrounds)
   - inputText: ALWAYS light (85-100% lightness) to contrast with dark inputBg
   - buttonText: MUST contrast with colorPrimary - use dark text (5-20%) for bright buttons, light text (90-100%) for dark buttons
4. For light themes (mode: "light"):
   - bgMain: 90-100% lightness  
   - inputBg: 90-98% lightness (slightly darker than bgMain)
   - textPrimary: 5-20% lightness (MUST contrast with ALL backgrounds)
   - inputText: ALWAYS dark (5-25% lightness) to contrast with light inputBg
   - buttonText: MUST contrast with colorPrimary - use light text (90-100%) for dark buttons, dark text (5-20%) for bright buttons
5. borderRadius: "small" (sharp), "medium" (balanced), or "large" (bubbly)
6. Create COHESIVE palettes - all backgrounds should flow together
7. Glass backgrounds should be slightly lighter/more saturated than bgMain
8. Gradient colors should create smooth transitions matching the vibe
9. neonPink, neonPurple, neonCyan are for glows and highlights - match the theme
10. backgroundOpacity: 20-50 for subtle, 50-70 for medium, 70-100 for strong image presence
11. backgroundBlur: 0-5 for sharp, 5-10 for soft, 10-20 for very blurred

BUTTON CONTRAST EXAMPLES:
- Bright pink button (330 80% 60%): Use dark text like "240 10% 10%"
- Dark purple button (280 50% 30%): Use light text like "0 0% 98%"
- Neon green button (120 100% 50%): Use dark text like "120 50% 10%"

INPUT FIELD RULES:
- inputBg MUST have clear visual separation from bgMain
- Input text (textPrimary inside inputs) MUST be readable against inputBg
- Input borders (borderColor) should be visible but not overpowering

Example: For "ocean theme" - use deep blues, teals, and aqua accents. ALL backgrounds should be oceanic, slow+smooth animations, bubbles effect. Inputs should have slightly lighter blue backgrounds with white text.

Base theme: ${JSON.stringify(baseTheme, null, 2)}`;

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Transform the ENTIRE app to match: "${prompt}". Change backgrounds, cards, sidebar, inputs, borders, pick appropriate animation speed+style AND a background effect that matches this vibe. EVERYTHING should match this mood.` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_theme",
              description: "Generate a complete immersive UI theme with animation settings and background effects",
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
                  animationSpeed: { type: "string", enum: ["slow", "normal", "fast", "instant"], description: "Animation speed: slow for calm, normal for balanced, fast for energetic, instant for snappy" },
                  animationStyle: { type: "string", enum: ["smooth", "bouncy", "snappy", "none"], description: "Animation style: smooth for elegant, bouncy for playful, snappy for modern, none for minimal" },
                  backgroundEffect: { type: "string", enum: ["none", "particles", "stars", "bubbles", "aurora", "rain", "snow", "fireflies", "geometric"], description: "Background visual effect that matches the theme mood" },
                  backgroundOverlay: { type: "string", description: "Overlay color for background image (HSL) - should match bgMain for cohesion" },
                  backgroundOpacity: { type: "number", description: "Background image opacity 0-100 (30 = subtle, 50 = balanced, 70+ = prominent)" },
                  backgroundBlur: { type: "number", description: "Background image blur 0-20 (0 = sharp, 10 = soft)" },
                  inputText: { type: "string", description: "Text color inside input fields (HSL) - MUST contrast with inputBg" },
                  buttonText: { type: "string", description: "Text color on primary buttons (HSL) - MUST contrast with colorPrimary" },
                },
                required: [
                  "colorPrimary", "colorSecondary", "colorAccent",
                  "bgMain", "bgCard", "bgGradientFrom", "bgGradientMid", "bgGradientTo",
                  "glassBg", "glassBorder", "sidebarBg", "navBg", "inputBg",
                  "textPrimary", "textSecondary", "borderColor",
                  "neonPink", "neonPurple", "neonCyan",
                  "borderRadius", "mode", "themeName",
                  "animationSpeed", "animationStyle", "backgroundEffect"
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
    
    // Determine mode first for contrast calculations
    const mode = ["light", "dark"].includes(theme.mode) ? theme.mode : baseTheme.mode;
    
    // Get validated colors
    const inputBg = validateHSL(theme.inputBg) || baseTheme.inputBg || "240 10% 18%";
    const colorPrimary = validateHSL(theme.colorPrimary) || baseTheme.colorPrimary;
    const bgMain = validateHSL(theme.bgMain) || baseTheme.bgMain;
    const textPrimary = validateHSL(theme.textPrimary) || baseTheme.textPrimary;

    // Sanitize all values with contrast enforcement
    const sanitizedTheme = {
      colorPrimary,
      colorSecondary: validateHSL(theme.colorSecondary) || baseTheme.colorSecondary,
      colorAccent: validateHSL(theme.colorAccent) || baseTheme.colorAccent,
      bgMain,
      bgCard: validateHSL(theme.bgCard) || baseTheme.bgCard,
      bgGradientFrom: validateHSL(theme.bgGradientFrom) || baseTheme.bgGradientFrom,
      bgGradientMid: validateHSL(theme.bgGradientMid) || baseTheme.bgGradientMid,
      bgGradientTo: validateHSL(theme.bgGradientTo) || baseTheme.bgGradientTo,
      glassBg: validateHSL(theme.glassBg) || baseTheme.glassBg,
      glassBorder: validateHSL(theme.glassBorder) || baseTheme.glassBorder,
      sidebarBg: validateHSL(theme.sidebarBg) || baseTheme.sidebarBg,
      navBg: validateHSL(theme.navBg) || baseTheme.navBg,
      inputBg,
      // Derive input text color with proper contrast
      inputText: validateHSL(theme.inputText) || deriveInputTextColor(inputBg, mode),
      // Derive button text color with proper contrast against primary
      buttonText: validateHSL(theme.buttonText) || deriveButtonTextColor(colorPrimary),
      // Ensure main text contrasts with background
      textPrimary: ensureContrast(bgMain, textPrimary, mode),
      textSecondary: validateHSL(theme.textSecondary) || baseTheme.textSecondary,
      borderColor: validateHSL(theme.borderColor) || baseTheme.borderColor,
      neonPink: validateHSL(theme.neonPink) || baseTheme.neonPink,
      neonPurple: validateHSL(theme.neonPurple) || baseTheme.neonPurple,
      neonCyan: validateHSL(theme.neonCyan) || baseTheme.neonCyan,
      borderRadius: ["small", "medium", "large"].includes(theme.borderRadius) 
        ? theme.borderRadius 
        : baseTheme.borderRadius,
      mode,
      themeName: theme.themeName || "Custom Theme",
      animationSpeed: ["slow", "normal", "fast", "instant"].includes(theme.animationSpeed)
        ? theme.animationSpeed
        : "normal",
      animationStyle: ["smooth", "bouncy", "snappy", "none"].includes(theme.animationStyle)
        ? theme.animationStyle
        : "smooth",
      // Background image and effects
      backgroundImage: bgSuggestion.image || undefined,
      backgroundEffect: ["none", "particles", "stars", "bubbles", "aurora", "rain", "snow", "fireflies", "geometric"].includes(theme.backgroundEffect)
        ? theme.backgroundEffect
        : (bgSuggestion.effect || "none"),
      backgroundOverlay: validateHSL(theme.backgroundOverlay) || undefined,
      backgroundOpacity: typeof theme.backgroundOpacity === "number" ? Math.min(100, Math.max(0, theme.backgroundOpacity)) : 35,
      backgroundBlur: typeof theme.backgroundBlur === "number" ? Math.min(20, Math.max(0, theme.backgroundBlur)) : 0,
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
