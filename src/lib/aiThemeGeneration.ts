import { invokeFunction } from '@/lib/firebase/functionsService';
import { sanitizeThemeTokens, type ThemeTokens } from '@/hooks/useCustomTheme';
import {
  buildLocalVibeTheme,
  detectVibeFromPrompt,
  isValidGeneratedTheme,
  type GeneratedTheme,
} from '@/lib/localVibeThemes';
import {
  brandThemePromptHint,
  buildBrandTheme,
  detectBrandFromPrompt,
} from '@/lib/brandThemePalettes';
import {
  buildThemeFromPrompt,
  promptThemeAiHint,
} from '@/lib/promptThemeBuilder';
import { generateThemeViaClientAi, formatAiFeatureError } from '@/lib/aiClientFallback';
import { isAiLogicConfigured } from '@/lib/firebase/aiLogic';

export type ThemeGenerationSource = 'cloud' | 'client' | 'local' | 'brand' | 'prompt';

export interface GenerateVybeThemeOptions {
  prompt: string;
  basePreset?: string;
  selectedVibe?: string | null;
  interests?: string[];
  selectedFont?: string | null;
  selectedAnimation?: { speed?: string; style?: string } | null;
}

export interface GenerateVybeThemeResult {
  theme: GeneratedTheme;
  source: ThemeGenerationSource;
  notice?: string;
}

const CLIENT_AI_MS = 6000;
const CLOUD_AI_MS = 5000;
/** Instant return when prompt clearly specifies colors/brand/scene. */
const INSTANT_CONFIDENCE = 0.72;

function normalizeCallableTheme(data: unknown): GeneratedTheme | null {
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;
  if (typeof obj.error === 'string' && obj.error) {
    throw new Error(obj.error);
  }
  const theme = (obj.theme ?? obj) as GeneratedTheme;
  return isValidGeneratedTheme(theme) ? theme : null;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('THEME_AI_TIMEOUT')), ms),
    ),
  ]);
}

function mergeAiTheme(base: GeneratedTheme, ai: GeneratedTheme): GeneratedTheme {
  return sanitizeThemeTokens({
    ...base,
    ...ai,
    themeName: ai.themeName || base.themeName,
    colorPrimary: ai.colorPrimary || base.colorPrimary,
    colorAccent: ai.colorAccent || base.colorAccent,
    colorSecondary: ai.colorSecondary || base.colorSecondary,
    bgMain: ai.bgMain || base.bgMain,
    bgCard: ai.bgCard || base.bgCard,
    mode: ai.mode || base.mode,
  });
}

/**
 * Fast + faithful theme generation:
 * 1) Instant parse (brand / hex / color words / scenes) — no network
 * 2) Optional client AI refine (6s cap) — skipped when instant confidence is high
 * 3) Optional cloud AI (5s cap) — only if client fails
 * 4) Always returns prompt-derived palette, never a random unrelated vibe
 */
export async function generateVybeTheme(
  options: GenerateVybeThemeOptions,
): Promise<GenerateVybeThemeResult> {
  const {
    prompt,
    basePreset = 'classic',
    selectedVibe,
    interests = [],
    selectedFont,
    selectedAnimation,
  } = options;

  const parsed = buildThemeFromPrompt(prompt, { selectedVibe, basePreset });
  const brandId = detectBrandFromPrompt(prompt);
  const brandTheme = brandId ? buildBrandTheme(brandId) : null;
  const brandHint = brandId ? brandThemePromptHint(brandId) : promptThemeAiHint(parsed);

  const userPrompt = [
    prompt.trim(),
    brandHint,
    interests.length ? `Interests: ${interests.slice(0, 8).join(', ')}` : '',
    selectedFont ? `Font style: ${selectedFont}` : '',
    selectedAnimation ? `Animation: ${JSON.stringify(selectedAnimation)}` : '',
    `Base preset: ${basePreset}`,
  ]
    .filter(Boolean)
    .join('\n');

  // High-confidence prompts — return immediately (fast + accurate)
  if (parsed.confidence >= INSTANT_CONFIDENCE) {
    return {
      theme: sanitizeThemeTokens(parsed.theme),
      source: brandTheme ? 'brand' : 'prompt',
    };
  }

  // Client + cloud in parallel (cap ~6s total, not sequential 11s)
  let cloudError: unknown;
  const baseTheme = parsed.theme;

  const clientPromise = isAiLogicConfigured()
    ? withTimeout(generateThemeViaClientAi(userPrompt), CLIENT_AI_MS)
        .then((raw) => (raw && isValidGeneratedTheme(raw) ? raw : null))
        .catch((err) => {
          cloudError = err;
          console.warn('[generateVybeTheme] client AI failed', err);
          return null;
        })
    : Promise.resolve(null);

  const cloudPromise = withTimeout(
    invokeFunction<{ theme?: GeneratedTheme; error?: string }>('generate-theme', {
      prompt: userPrompt,
      basePreset,
      interests,
      selectedFont: selectedFont ?? undefined,
      selectedAnimation: selectedAnimation ?? undefined,
    }),
    CLOUD_AI_MS,
  )
    .then(({ data, error }) => {
      if (error) throw new Error(error.message || 'Theme generation failed');
      return normalizeCallableTheme(data);
    })
    .catch((err) => {
      cloudError = cloudError ?? err;
      console.warn('[generateVybeTheme] cloud failed', err);
      return null;
    });

  const [clientRaw, cloudTheme] = await Promise.all([clientPromise, cloudPromise]);

  if (clientRaw) {
    return {
      theme: mergeAiTheme(baseTheme, sanitizeThemeTokens(clientRaw as ThemeTokens)),
      source: 'client',
    };
  }
  if (cloudTheme) {
    return {
      theme: mergeAiTheme(baseTheme, sanitizeThemeTokens(cloudTheme)),
      source: 'cloud',
    };
  }

  const vibe =
    selectedVibe ||
    detectVibeFromPrompt(prompt) ||
    (basePreset && basePreset !== 'classic' ? basePreset : 'dark');
  const fallback = brandTheme ?? (parsed.confidence >= 0.4 ? parsed.theme : buildLocalVibeTheme(vibe));

  const cloudMsg = formatAiFeatureError(cloudError, '');
  const notice =
    cloudMsg && (cloudMsg.includes('GEMINI') || cloudMsg.includes('VYBE AI') || cloudMsg.includes('timeout'))
      ? `Applied colors from your prompt. ${cloudMsg.includes('timeout') ? 'AI timed out — ' : ''}Palette matched locally.`
      : parsed.confidence >= 0.4
        ? undefined
        : `Applied "${fallback.themeName ?? 'custom'}" palette from your description.`;

  return {
    theme: sanitizeThemeTokens(fallback),
    source: brandTheme ? 'brand' : parsed.confidence >= 0.4 ? 'prompt' : 'local',
    notice,
  };
}
