import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { validateAuth } from "../_shared/auth.ts";
import { rateLimitOrNull } from "../_shared/rateLimit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface AdvancedThemeTokens {
  // Core colors
  colorPrimary: string;
  colorSecondary: string;
  colorAccent: string;
  
  // Backgrounds
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
  
  // Text colors
  textPrimary: string;
  textSecondary: string;
  
  // Borders & effects
  borderColor?: string;
  borderRadius: "small" | "medium" | "large";
  
  // Neon accents
  neonPink?: string;
  neonPurple?: string;
  neonCyan?: string;
  
  // Animation settings
  animationSpeed?: "slow" | "normal" | "fast" | "instant";
  animationStyle?: "smooth" | "bouncy" | "snappy" | "none";
  
  // Background effects
  backgroundEffect?: "none" | "particles" | "stars" | "bubbles" | "aurora" | "rain" | "snow" | "fireflies" | "geometric";
  backgroundImage?: string;
  backgroundOverlay?: string;
  backgroundBlur?: number;
  backgroundOpacity?: number;
  
  // Mode
  mode: "light" | "dark";
  
  // Advanced: Typography
  fontFamily?: string;
  fontDisplay?: string;
  fontWeight?: "light" | "normal" | "medium" | "bold";
  letterSpacing?: "tight" | "normal" | "wide";
  
  // Advanced: Personality
  themeName: string;
  personality?: string;
  mood?: string;
}

// Font pairing suggestions - extended with more options
const FONT_PAIRINGS: Record<string, { body: string; display: string }> = {
  modern: { body: "Inter", display: "Space Grotesk" },
  elegant: { body: "Crimson Pro", display: "Playfair Display" },
  playful: { body: "Nunito", display: "Fredoka" },
  tech: { body: "JetBrains Mono", display: "Orbitron" },
  minimal: { body: "IBM Plex Sans", display: "IBM Plex Sans" },
  editorial: { body: "Merriweather", display: "Libre Baskerville" },
  bold: { body: "Montserrat", display: "Anton" },
  soft: { body: "Quicksand", display: "Comfortaa" },
  artistic: { body: "Poppins", display: "Syne" },
  luxury: { body: "Cormorant Garamond", display: "Cinzel" },
  gaming: { body: "Exo 2", display: "Audiowide" },
  retro: { body: "DM Sans", display: "Righteous" },
};

// Mood-based background images from Unsplash
const MOOD_BACKGROUNDS: Record<string, string[]> = {
  calm: [
    "https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=1920&q=80",
    "https://images.unsplash.com/photo-1518882605630-8df77e4bf24f?w=1920&q=80",
  ],
  energetic: [
    "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=1920&q=80",
    "https://images.unsplash.com/photo-1550684376-efcbd6e3f031?w=1920&q=80",
  ],
  mysterious: [
    "https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=1920&q=80",
    "https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=1920&q=80",
  ],
  natural: [
    "https://images.unsplash.com/photo-1448375240586-882707db888b?w=1920&q=80",
    "https://images.unsplash.com/photo-1502082553048-f009c37129b9?w=1920&q=80",
  ],
  romantic: [
    "https://images.unsplash.com/photo-1495344517868-8ebaf0a2044a?w=1920&q=80",
    "https://images.unsplash.com/photo-1518882605630-8df77e4bf24f?w=1920&q=80",
  ],
  urban: [
    "https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=1920&q=80",
    "https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=1920&q=80",
  ],
  winter: [
    "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1920&q=80",
    "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&q=80",
  ],
  cosmic: [
    "https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=1920&q=80",
    "https://images.unsplash.com/photo-1483347756197-71ef80e95f73?w=1920&q=80",
  ],
};

function getMoodFromPrompt(prompt: string): string {
  const lowerPrompt = prompt.toLowerCase();
  
  if (lowerPrompt.includes("calm") || lowerPrompt.includes("peaceful") || lowerPrompt.includes("serene") || lowerPrompt.includes("ocean")) {
    return "calm";
  }
  if (lowerPrompt.includes("energy") || lowerPrompt.includes("vibrant") || lowerPrompt.includes("bold") || lowerPrompt.includes("neon")) {
    return "energetic";
  }
  if (lowerPrompt.includes("dark") || lowerPrompt.includes("mystery") || lowerPrompt.includes("gothic") || lowerPrompt.includes("night")) {
    return "mysterious";
  }
  if (lowerPrompt.includes("nature") || lowerPrompt.includes("forest") || lowerPrompt.includes("green") || lowerPrompt.includes("earth")) {
    return "natural";
  }
  if (lowerPrompt.includes("pink") || lowerPrompt.includes("romantic") || lowerPrompt.includes("soft") || lowerPrompt.includes("pastel")) {
    return "romantic";
  }
  if (lowerPrompt.includes("city") || lowerPrompt.includes("urban") || lowerPrompt.includes("cyberpunk") || lowerPrompt.includes("tech")) {
    return "urban";
  }
  if (lowerPrompt.includes("winter") || lowerPrompt.includes("snow") || lowerPrompt.includes("cold") || lowerPrompt.includes("ice")) {
    return "winter";
  }
  if (lowerPrompt.includes("space") || lowerPrompt.includes("cosmic") || lowerPrompt.includes("galaxy") || lowerPrompt.includes("star")) {
    return "cosmic";
  }
  
  return "energetic"; // Default
}

// Curated fallback themes per mood — used when no AI key is configured or
// the AI call fails, so theme generation never dead-ends.
const CURATED_THEMES: Record<string, Omit<AdvancedThemeTokens, "fontFamily" | "fontDisplay">> = {
  calm: {
    themeName: "Ocean Drift", colorPrimary: "199 89% 56%", colorSecondary: "217 60% 18%", colorAccent: "174 72% 50%",
    bgMain: "215 50% 6%", bgCard: "215 45% 10%", bgGradientFrom: "215 55% 5%", bgGradientMid: "205 50% 9%", bgGradientTo: "190 45% 7%",
    textPrimary: "200 30% 96%", textSecondary: "205 20% 68%", borderColor: "210 40% 18%",
    neonPink: "330 80% 65%", neonPurple: "260 75% 65%", neonCyan: "185 95% 55%",
    borderRadius: "large", mode: "dark", animationSpeed: "slow", animationStyle: "smooth", backgroundEffect: "bubbles",
    personality: "serene", mood: "calm",
  },
  energetic: {
    themeName: "Voltage Rush", colorPrimary: "16 100% 57%", colorSecondary: "350 85% 22%", colorAccent: "45 100% 55%",
    bgMain: "340 35% 6%", bgCard: "340 30% 10%", bgGradientFrom: "350 45% 5%", bgGradientMid: "20 50% 9%", bgGradientTo: "340 40% 6%",
    textPrimary: "20 30% 97%", textSecondary: "20 15% 70%", borderColor: "350 35% 18%",
    neonPink: "340 100% 60%", neonPurple: "280 90% 62%", neonCyan: "180 100% 50%",
    borderRadius: "medium", mode: "dark", animationSpeed: "fast", animationStyle: "bouncy", backgroundEffect: "particles",
    personality: "electric", mood: "energetic",
  },
  mysterious: {
    themeName: "Violet Eclipse", colorPrimary: "270 85% 65%", colorSecondary: "260 45% 16%", colorAccent: "300 80% 60%",
    bgMain: "262 50% 5%", bgCard: "262 45% 9%", bgGradientFrom: "265 55% 4%", bgGradientMid: "280 50% 8%", bgGradientTo: "250 45% 6%",
    textPrimary: "270 25% 96%", textSecondary: "265 15% 66%", borderColor: "265 40% 17%",
    neonPink: "320 90% 62%", neonPurple: "275 95% 66%", neonCyan: "200 90% 58%",
    borderRadius: "large", mode: "dark", animationSpeed: "normal", animationStyle: "smooth", backgroundEffect: "stars",
    personality: "enigmatic", mood: "mysterious",
  },
  natural: {
    themeName: "Forest Pulse", colorPrimary: "152 65% 45%", colorSecondary: "150 35% 15%", colorAccent: "88 60% 52%",
    bgMain: "160 35% 5%", bgCard: "158 30% 9%", bgGradientFrom: "162 40% 4%", bgGradientMid: "150 35% 8%", bgGradientTo: "140 30% 6%",
    textPrimary: "140 25% 96%", textSecondary: "145 15% 66%", borderColor: "152 30% 16%",
    neonPink: "330 70% 62%", neonPurple: "265 60% 62%", neonCyan: "170 85% 48%",
    borderRadius: "large", mode: "dark", animationSpeed: "slow", animationStyle: "smooth", backgroundEffect: "fireflies",
    personality: "grounded", mood: "natural",
  },
  romantic: {
    themeName: "Blush Reverie", colorPrimary: "330 80% 66%", colorSecondary: "315 35% 90%", colorAccent: "265 70% 70%",
    bgMain: "320 40% 97%", bgCard: "0 0% 100%", bgGradientFrom: "325 50% 98%", bgGradientMid: "300 45% 96%", bgGradientTo: "260 40% 97%",
    textPrimary: "325 35% 12%", textSecondary: "320 15% 42%", borderColor: "320 30% 88%",
    neonPink: "335 90% 62%", neonPurple: "275 80% 64%", neonCyan: "195 85% 55%",
    borderRadius: "large", mode: "light", animationSpeed: "normal", animationStyle: "smooth", backgroundEffect: "aurora",
    personality: "dreamy", mood: "romantic",
  },
  urban: {
    themeName: "Neon District", colorPrimary: "180 100% 50%", colorSecondary: "280 60% 20%", colorAccent: "320 100% 60%",
    bgMain: "240 30% 5%", bgCard: "240 25% 9%", bgGradientFrom: "245 35% 4%", bgGradientMid: "270 35% 8%", bgGradientTo: "220 30% 6%",
    textPrimary: "200 30% 97%", textSecondary: "220 15% 68%", borderColor: "240 30% 17%",
    neonPink: "320 100% 60%", neonPurple: "275 95% 64%", neonCyan: "182 100% 52%",
    borderRadius: "small", mode: "dark", animationSpeed: "fast", animationStyle: "snappy", backgroundEffect: "geometric",
    personality: "cyber", mood: "urban",
  },
  winter: {
    themeName: "Frostlight", colorPrimary: "205 90% 62%", colorSecondary: "210 30% 88%", colorAccent: "175 70% 55%",
    bgMain: "210 45% 97%", bgCard: "0 0% 100%", bgGradientFrom: "210 50% 98%", bgGradientMid: "200 45% 96%", bgGradientTo: "220 40% 97%",
    textPrimary: "215 45% 12%", textSecondary: "212 20% 42%", borderColor: "210 35% 87%",
    neonPink: "330 75% 64%", neonPurple: "260 70% 66%", neonCyan: "190 90% 52%",
    borderRadius: "medium", mode: "light", animationSpeed: "slow", animationStyle: "smooth", backgroundEffect: "snow",
    personality: "crisp", mood: "winter",
  },
  cosmic: {
    themeName: "Stellar Drift", colorPrimary: "255 90% 67%", colorSecondary: "240 45% 16%", colorAccent: "190 95% 55%",
    bgMain: "248 45% 5%", bgCard: "248 40% 9%", bgGradientFrom: "252 50% 4%", bgGradientMid: "265 45% 8%", bgGradientTo: "235 40% 6%",
    textPrimary: "250 30% 97%", textSecondary: "248 15% 68%", borderColor: "250 35% 17%",
    neonPink: "315 90% 64%", neonPurple: "262 95% 68%", neonCyan: "188 100% 56%",
    borderRadius: "large", mode: "dark", animationSpeed: "normal", animationStyle: "smooth", backgroundEffect: "stars",
    personality: "infinite", mood: "cosmic",
  },
};

function buildCuratedTheme(mood: string): AdvancedThemeTokens {
  const base = CURATED_THEMES[mood] || CURATED_THEMES.cosmic;
  return { ...base } as AdvancedThemeTokens;
}

function getFontStyle(prompt: string): string {
  const lowerPrompt = prompt.toLowerCase();
  
  if (lowerPrompt.includes("elegant") || lowerPrompt.includes("luxury") || lowerPrompt.includes("sophisticated")) {
    return "elegant";
  }
  if (lowerPrompt.includes("playful") || lowerPrompt.includes("fun") || lowerPrompt.includes("cute")) {
    return "playful";
  }
  if (lowerPrompt.includes("tech") || lowerPrompt.includes("cyber") || lowerPrompt.includes("futuristic") || lowerPrompt.includes("code")) {
    return "tech";
  }
  if (lowerPrompt.includes("minimal") || lowerPrompt.includes("clean") || lowerPrompt.includes("simple")) {
    return "minimal";
  }
  if (lowerPrompt.includes("bold") || lowerPrompt.includes("strong") || lowerPrompt.includes("powerful")) {
    return "bold";
  }
  if (lowerPrompt.includes("soft") || lowerPrompt.includes("gentle") || lowerPrompt.includes("calm")) {
    return "soft";
  }
  
  return "modern";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await validateAuth(req);
    if (!auth.authenticated) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const limited = await rateLimitOrNull(`gen-adv-theme:${auth.userId}`, 10, 60, corsHeaders);
    if (limited) return limited;

    const { prompt, interests = [], includeFont = true, includeEffects = true, selectedFont, selectedAnimation } = await req.json();
    // Prefer Lovable AI Gateway (more reliable, no per-key quota issues).
    // Fall back to direct Gemini key if the gateway key isn't present.
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

    // Get mood from prompt first
    const mood = getMoodFromPrompt(prompt);

    // Use selected font or analyze prompt
    const fontStyle = selectedFont || getFontStyle(prompt);
    const fonts = FONT_PAIRINGS[fontStyle] || FONT_PAIRINGS.modern;
    
    // Get background suggestion
    const backgrounds = MOOD_BACKGROUNDS[mood] || MOOD_BACKGROUNDS.energetic;
    const selectedBackground = backgrounds[Math.floor(Math.random() * backgrounds.length)];
    
    // Get animation preferences
    const animSpeed = selectedAnimation?.speed || (mood === "calm" ? "slow" : mood === "energetic" ? "fast" : "normal");
    const animStyle = selectedAnimation?.style || (mood === "calm" ? "smooth" : mood === "energetic" ? "bouncy" : "smooth");

    const systemPrompt = `You are an elite UI theme designer for VYBE, a cutting-edge social media app.
Your mission is to create STUNNING, IMMERSIVE themes that completely transform the user experience.

When interpreting the user's request, think about:
1. EMOTIONAL IMPACT - What feeling should the app evoke?
2. COLOR PSYCHOLOGY - Use colors that match the mood
3. VISUAL HIERARCHY - Ensure readability while being beautiful
4. COHESIVENESS - Every element should feel part of the same world

The user's interests include: ${interests.join(", ") || "general"}
Detected mood: ${mood}
Suggested font style: ${fontStyle}
Animation speed: ${animSpeed}
Animation style: ${animStyle}

CRITICAL CONTRAST RULES - MUST FOLLOW:
1. ALL colors in HSL format: "hue saturation% lightness%"
2. Ensure WCAG AA contrast (4.5:1 minimum for text)
3. Create a CREATIVE, UNIQUE theme name that captures the vibe
4. NEVER use similar hue for text and background (e.g., no blue text on teal)
5. Text must ALWAYS be clearly readable - use near-white (95%+ lightness) for dark themes, near-black (10% or less) for light themes

FOR DARK THEMES (mode: "dark"):
- bgMain: 4-12% lightness
- inputBg: 12-25% lightness
- textPrimary: MUST be 92-100% lightness (near white)
- textSecondary: 55-75% lightness
- buttonText: If primary color lightness > 50%, use dark text (5-15%), else use light text (90-100%)
- inputText: ALWAYS 90-100% lightness (white/off-white)

FOR LIGHT THEMES (mode: "light"):
- bgMain: 92-100% lightness  
- inputBg: 90-98% lightness
- textPrimary: MUST be 5-15% lightness (near black)
- textSecondary: 35-55% lightness
- buttonText: If primary color lightness < 50%, use light text (90-100%), else use dark text (5-15%)
- inputText: ALWAYS 5-20% lightness (dark)

CONTRAST FAILURE EXAMPLES TO AVOID:
- Teal background + blue text = BAD (too similar)
- Pink background + red text = BAD (too similar)
- Low contrast between any text and its background

ANIMATION GUIDE:
- animationSpeed: "slow" = zen/calm, "normal" = balanced, "fast" = energetic, "instant" = snappy
- animationStyle: "smooth" = elegant, "bouncy" = playful, "snappy" = modern, "none" = minimal

BACKGROUND EFFECTS:
- "none" = minimal themes
- "particles" = general ambient
- "stars" = space/night themes
- "bubbles" = ocean/water themes
- "aurora" = ethereal/magical themes
- "rain" = moody/dramatic themes
- "snow" = winter/cold themes
- "fireflies" = nature/forest themes
- "geometric" = tech/modern themes

CREATE SOMETHING EXTRAORDINARY. Push creative boundaries while ALWAYS maintaining excellent readability.`;

    // Attempt AI generation; fall back to curated theme on any failure
    let theme: AdvancedThemeTokens | null = null;

    if (LOVABLE_API_KEY || GEMINI_API_KEY) {
      try {
        theme = await generateWithAI();
      } catch (aiError) {
        console.error("AI generation failed, using curated fallback:", aiError);
        theme = null;
      }
    } else {
      console.warn("No AI key configured — using curated theme fallback");
    }

    if (!theme) {
      theme = buildCuratedTheme(mood);
      theme.animationSpeed = animSpeed as AdvancedThemeTokens["animationSpeed"];
      theme.animationStyle = animStyle as AdvancedThemeTokens["animationStyle"];
    }

    async function generateWithAI(): Promise<AdvancedThemeTokens> {
    const useGateway = !!LOVABLE_API_KEY;
    const endpoint = useGateway
      ? "https://ai.gateway.lovable.dev/v1/chat/completions"
      : "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
    const model = useGateway ? "google/gemini-2.5-flash" : "gemini-2.5-pro";
    const apiKey = useGateway ? LOVABLE_API_KEY : GEMINI_API_KEY;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { 
            role: "user", 
            content: `Create a completely immersive theme for: "${prompt}"
            
Transform EVERYTHING - colors, backgrounds, cards, inputs, buttons, text, effects, animations.
Make it feel like a completely different app that perfectly matches this vibe.
Be creative with the theme name - make it memorable and evocative.` 
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_advanced_theme",
              description: "Generate a complete, immersive UI theme with advanced customization",
              parameters: {
                type: "object",
                properties: {
                  themeName: { 
                    type: "string", 
                    description: "Creative, evocative theme name (e.g., 'Midnight Aurora', 'Coral Dreams', 'Neon Pulse')" 
                  },
                  colorPrimary: { type: "string", description: "Primary accent color (HSL)" },
                  colorSecondary: { type: "string", description: "Secondary color (HSL)" },
                  colorAccent: { type: "string", description: "Accent/highlight color (HSL)" },
                  bgMain: { type: "string", description: "Main background color (HSL)" },
                  bgCard: { type: "string", description: "Card/surface background (HSL)" },
                  bgGradientFrom: { type: "string", description: "Gradient start (HSL)" },
                  bgGradientMid: { type: "string", description: "Gradient middle (HSL)" },
                  bgGradientTo: { type: "string", description: "Gradient end (HSL)" },
                  glassBg: { type: "string", description: "Glass effect background (HSL)" },
                  glassBorder: { type: "string", description: "Glass border color (HSL)" },
                  sidebarBg: { type: "string", description: "Sidebar background (HSL)" },
                  navBg: { type: "string", description: "Navigation background (HSL)" },
                  inputBg: { type: "string", description: "Input field background (HSL)" },
                  inputText: { type: "string", description: "Input text color (HSL) - MUST contrast with inputBg" },
                  buttonText: { type: "string", description: "Primary button text color (HSL) - MUST contrast with colorPrimary" },
                  textPrimary: { type: "string", description: "Primary text color (HSL)" },
                  textSecondary: { type: "string", description: "Secondary/muted text (HSL)" },
                  borderColor: { type: "string", description: "Default border color (HSL)" },
                  neonPink: { type: "string", description: "Neon pink accent (HSL)" },
                  neonPurple: { type: "string", description: "Neon purple accent (HSL)" },
                  neonCyan: { type: "string", description: "Neon cyan accent (HSL)" },
                  borderRadius: { 
                    type: "string", 
                    enum: ["small", "medium", "large"],
                    description: "Corner roundness style" 
                  },
                  mode: { 
                    type: "string", 
                    enum: ["light", "dark"],
                    description: "Light or dark mode" 
                  },
                  animationSpeed: { 
                    type: "string", 
                    enum: ["slow", "normal", "fast", "instant"],
                    description: "Animation speed matching the energy" 
                  },
                  animationStyle: { 
                    type: "string", 
                    enum: ["smooth", "bouncy", "snappy", "none"],
                    description: "Animation easing style" 
                  },
                  backgroundEffect: { 
                    type: "string", 
                    enum: ["none", "particles", "stars", "bubbles", "aurora", "rain", "snow", "fireflies", "geometric"],
                    description: "Background visual effect" 
                  },
                  backgroundOpacity: { 
                    type: "number", 
                    description: "Background image opacity (0-100)" 
                  },
                  backgroundBlur: { 
                    type: "number", 
                    description: "Background blur amount (0-20)" 
                  },
                  personality: { 
                    type: "string", 
                    description: "One-word personality trait (e.g., 'dreamy', 'bold', 'serene')" 
                  },
                },
                required: [
                  "themeName", "colorPrimary", "colorSecondary", "colorAccent",
                  "bgMain", "bgCard", "textPrimary", "textSecondary",
                  "borderRadius", "mode", "animationSpeed", "animationStyle", "backgroundEffect"
                ],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_advanced_theme" } },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API error:", response.status, errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      console.error("No tool_call in AI response:", JSON.stringify(data).slice(0, 1000));
      throw new Error("No theme generated");
    }

    return JSON.parse(toolCall.function.arguments) as AdvancedThemeTokens;
    }

    // Add font information
    if (includeFont) {
      theme.fontFamily = fonts.body;
      theme.fontDisplay = fonts.display;
    }
    
    // Add background image if effects are enabled
    if (includeEffects && mood) {
      theme.backgroundImage = selectedBackground;
      theme.backgroundOpacity = theme.backgroundOpacity ?? 40;
      theme.backgroundBlur = theme.backgroundBlur ?? 5;
    }
    
    theme.mood = mood;

    return new Response(
      JSON.stringify({ theme, success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Theme generation error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to generate theme" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
