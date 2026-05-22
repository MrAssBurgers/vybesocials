import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface CustomAnimations {
  // Named keyframe animations
  keyframes: {
    name: string;
    frames: string; // CSS @keyframes content
  }[];
  
  // CSS custom properties for animation settings
  variables: {
    name: string;
    value: string;
  }[];
  
  // Animation classes to apply
  classes: {
    selector: string;
    animation: string;
  }[];
  
  // Description of what was created
  description: string;
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
    const limited = await rateLimitOrNull(`gen-anim:${auth.userId}`, 10, 60, corsHeaders);
    if (limited) return limited;

    const { prompt, mood = "balanced" } = await req.json();
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    if (!prompt || prompt.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Animation description is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `You are an expert CSS animation designer. Create custom CSS animations based on the user's description.

CRITICAL RULES:
1. Generate valid CSS @keyframes animations
2. Use transform, opacity, and filter for performance (GPU-accelerated)
3. Avoid animating layout properties (width, height, margin, padding)
4. Keep animations smooth (use ease, ease-in-out, cubic-bezier)
5. Consider reduced-motion preferences
6. Make animations subtle and tasteful - not distracting
7. Use appropriate timing (slower for calm vibes, faster for energetic)

ANIMATION TARGETS:
- "vybe-hover": Applied to interactive elements on hover
- "vybe-entrance": Applied when elements appear/mount
- "vybe-pulse": Continuous subtle animation for emphasis
- "vybe-float": Ambient floating animation
- "vybe-glow": Glow/shimmer effects
- "vybe-special": Special effect for key moments

MOOD CONTEXT: ${mood}
- calm/zen: Slower, gentler animations (2-4s duration)
- balanced: Moderate speed (0.5-2s duration)
- energetic: Faster, more dynamic (0.2-0.8s duration)

OUTPUT FORMAT:
Generate 3-5 custom keyframe animations with:
1. Unique, descriptive names (prefix with "vybe-custom-")
2. Well-crafted keyframe sequences
3. Appropriate timing functions
4. CSS variables for easy customization`;

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { 
            role: "user", 
            content: `Create custom animations for: "${prompt}"
            
Generate beautiful, performant CSS animations that capture this feeling.` 
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_animations",
              description: "Generate custom CSS keyframe animations",
              parameters: {
                type: "object",
                properties: {
                  keyframes: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { 
                          type: "string", 
                          description: "Animation name (e.g., vybe-custom-float)" 
                        },
                        frames: { 
                          type: "string", 
                          description: "CSS keyframes content (e.g., '0% { transform: translateY(0); } 50% { transform: translateY(-10px); } 100% { transform: translateY(0); }')" 
                        },
                      },
                      required: ["name", "frames"],
                    },
                    description: "Array of keyframe animations"
                  },
                  variables: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string", description: "CSS variable name (e.g., --vybe-anim-duration)" },
                        value: { type: "string", description: "CSS variable value (e.g., 2s)" },
                      },
                      required: ["name", "value"],
                    },
                    description: "CSS custom properties for animation settings"
                  },
                  classes: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        selector: { 
                          type: "string", 
                          description: "Target selector (e.g., .vybe-hover, .vybe-entrance)" 
                        },
                        animation: { 
                          type: "string", 
                          description: "Animation shorthand (e.g., vybe-custom-float 2s ease-in-out infinite)" 
                        },
                      },
                      required: ["selector", "animation"],
                    },
                    description: "Animation class mappings"
                  },
                  description: {
                    type: "string",
                    description: "Brief description of the animation style created"
                  },
                },
                required: ["keyframes", "variables", "classes", "description"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_animations" } },
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
          JSON.stringify({ error: "API credits exhausted. Please add funds." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI API error:", response.status, errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall?.function?.arguments) {
      throw new Error("No animations generated");
    }

    const animations = JSON.parse(toolCall.function.arguments) as CustomAnimations;
    
    // Generate the complete CSS string
    let cssString = `/* Custom VYBE Animations - ${animations.description} */\n\n`;
    
    // Add CSS variables
    cssString += `:root {\n`;
    for (const variable of animations.variables) {
      cssString += `  ${variable.name}: ${variable.value};\n`;
    }
    cssString += `}\n\n`;
    
    // Add keyframes
    for (const keyframe of animations.keyframes) {
      cssString += `@keyframes ${keyframe.name} {\n  ${keyframe.frames}\n}\n\n`;
    }
    
    // Add animation classes
    for (const cls of animations.classes) {
      cssString += `${cls.selector} {\n  animation: ${cls.animation};\n}\n\n`;
    }
    
    // Add reduced motion support
    cssString += `@media (prefers-reduced-motion: reduce) {\n`;
    for (const cls of animations.classes) {
      cssString += `  ${cls.selector} { animation: none; }\n`;
    }
    cssString += `}\n`;

    return new Response(
      JSON.stringify({ 
        animations, 
        css: cssString,
        success: true 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Animation generation error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to generate animations" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
