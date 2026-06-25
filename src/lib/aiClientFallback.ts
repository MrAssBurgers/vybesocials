import { Schema } from 'firebase/ai';
import { getJsonModel, isAiLogicConfigured } from '@/lib/firebase/aiLogic';
import { captionsResponseSchema } from '@/lib/firebase/aiSchemas';
import { formatFirebaseAiError } from '@/lib/firebase/aiChat';

const THEME_SYSTEM = `You are an elite UI theme designer for VYBE social app.
When the user names a brand, franchise, sports team, app, or aesthetic — match their REAL official colors and mood (Nike=black/white/orange, Spotify=green, Coca-Cola=red, Tiffany=robin-egg blue, etc.).
When they describe a scene or vibe — derive colors from that scene's dominant palette.
Return ONLY valid JSON: {"theme":{"colorPrimary":"H S% L%","colorSecondary":"H S% L%","colorAccent":"H S% L%","bgMain":"H S% L%","bgCard":"H S% L%","textPrimary":"H S% L%","textSecondary":"H S% L%","borderColor":"H S% L%","borderRadius":"medium","mode":"dark"|"light","themeName":"creative name","backgroundEffect":"aurora"|"particles"|"none"|"stars","animationSpeed":"normal","animationStyle":"smooth"}}
Use HSL without hsl() wrapper. Ensure readable contrast.`;

const themeGenerationSchema = Schema.object({
  properties: {
    theme: Schema.object({
      properties: {
        colorPrimary: Schema.string(),
        colorSecondary: Schema.string(),
        colorAccent: Schema.string(),
        bgMain: Schema.string(),
        bgCard: Schema.string(),
        textPrimary: Schema.string(),
        textSecondary: Schema.string(),
        borderColor: Schema.string(),
        borderRadius: Schema.string(),
        mode: Schema.string(),
        themeName: Schema.string(),
        backgroundEffect: Schema.string(),
        animationSpeed: Schema.string(),
        animationStyle: Schema.string(),
      },
      optionalProperties: [
        'colorSecondary',
        'borderColor',
        'borderRadius',
        'backgroundEffect',
        'animationSpeed',
        'animationStyle',
        'themeName',
      ],
    }),
  },
  optionalProperties: [],
});

function parseJsonObject<T>(raw: string): T | null {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return null;
    }
  }
}

/** Client-side Gemini theme JSON (Firebase AI Logic). */
export async function generateThemeViaClientAi(prompt: string): Promise<Record<string, unknown> | null> {
  if (!isAiLogicConfigured()) return null;
  const model = getJsonModel(themeGenerationSchema);
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: `${THEME_SYSTEM}\n\nDesign request: ${prompt}` }] }],
  });
  const raw = result.response.text();
  const parsed = parseJsonObject<{ theme?: Record<string, unknown> }>(raw);
  return (parsed?.theme || parsed) ?? null;
}

/** Client-side caption suggestions when Cloud Function fails. */
export async function generateCaptionsClient(
  tags: string[],
  contentType: string,
): Promise<string[]> {
  if (!isAiLogicConfigured()) return [];
  const model = getJsonModel(captionsResponseSchema);
  const tagLine = tags.length ? `Tags: ${tags.slice(0, 8).join(', ')}` : 'No tags';
  const result = await model.generateContent({
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `Write 3 short social post captions (max 120 chars each) for a ${contentType}. ${tagLine}. Return JSON only.`,
          },
        ],
      },
    ],
  });
  const parsed = parseJsonObject<{ captions?: string[] }>(result.response.text());
  const captions = parsed?.captions?.filter((c) => typeof c === 'string' && c.trim()) ?? [];
  return captions.slice(0, 5);
}

export function formatAiFeatureError(error: unknown, fallback: string): string {
  return formatFirebaseAiError(error) || (error instanceof Error ? error.message : fallback);
}
