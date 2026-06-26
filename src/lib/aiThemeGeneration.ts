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
import {
  defaultThemePromptFromContext,
  formatThemeUserContext,
  hasThemeUserContext,
  type ThemeUserContext,
} from '@/lib/theme/themeUserContext';

export type ThemeGenerationSource = 'cloud' | 'client' | 'local' | 'brand' | 'prompt';

export interface GenerateVybeThemeOptions {
  prompt: string;
  basePreset?: string;
  selectedVibe?: string | null;
  interests?: string[];
  selectedFont?: string | null;
  selectedAnimation?: { speed?: string; style?: string } | null;
  userContext?: ThemeUserContext | null;
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

function mergeAiTheme(
  base: GeneratedTheme,
  ai: GeneratedTheme,
  options?: { preferBaseColors?: boolean },
): GeneratedTheme {
  const preferBase = options?.preferBaseColors ?? false;
  return sanitizeThemeTokens({
    ...base,
    ...ai,
    themeName: ai.themeName || base.themeName,
    colorPrimary: preferBase ? base.colorPrimary : ai.colorPrimary || base.colorPrimary,
    colorAccent: preferBase ? base.colorAccent : ai.colorAccent || base.colorAccent,
    colorSecondary: preferBase ? base.colorSecondary : ai.colorSecondary || base.colorSecondary,
    bgMain: preferBase ? base.bgMain : ai.bgMain || base.bgMain,
    bgCard: preferBase ? base.bgCard : ai.bgCard || base.bgCard,
    mode: ai.mode || base.mode,
    backgroundEffect: ai.backgroundEffect || base.backgroundEffect,
    animationSpeed: ai.animationSpeed || base.animationSpeed,
    animationStyle: ai.animationStyle || base.animationStyle,
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
    userContext,
  } = options;

  const contextBlock = formatThemeUserContext(userContext);
  const mergedInterests = [
    ...interests,
    ...(userContext?.interests ?? []),
  ]
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .slice(0, 10);

  const trimmedPrompt = prompt.trim();
  const effectivePrompt =
    trimmedPrompt || (hasThemeUserContext(userContext) ? defaultThemePromptFromContext(userContext) : '');

  const parsed = buildThemeFromPrompt(effectivePrompt || prompt, { selectedVibe, basePreset });
  const brandId = detectBrandFromPrompt(effectivePrompt || prompt);
  const brandTheme = brandId ? buildBrandTheme(brandId) : null;
  const brandHint = brandId ? brandThemePromptHint(brandId) : promptThemeAiHint(parsed);
  const preferBaseColors = Boolean(brandId) || parsed.confidence >= INSTANT_CONFIDENCE;

  const userPrompt = [
    effectivePrompt,
    contextBlock,
    brandHint,
    mergedInterests.length ? `Interests: ${mergedInterests.join(', ')}` : '',
    selectedFont ? `Font style: ${selectedFont}` : '',
    selectedAnimation ? `Animation: ${JSON.stringify(selectedAnimation)}` : '',
    `Base preset: ${basePreset}`,
  ]
    .filter(Boolean)
    .join('\n');

  // Brand / high-confidence prompts — instant return, never generic purple AI.
  if (brandId && brandTheme) {
    return {
      theme: sanitizeThemeTokens(brandTheme),
      source: 'brand',
    };
  }

  if (parsed.confidence >= INSTANT_CONFIDENCE && (trimmedPrompt.length > 0 || effectivePrompt.length > 0)) {
    return {
      theme: sanitizeThemeTokens(parsed.theme),
      source: 'prompt',
    };
  }

  // Strong local palette — skip AI (prevents purple override); AI runs for open-ended prompts.
  if (preferBaseColors && parsed.confidence >= 0.55 && !trimmedPrompt.match(/\b(create|design|personalized|my vybe)\b/i)) {
    return {
      theme: sanitizeThemeTokens(parsed.theme),
      source: 'prompt',
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
      interests: mergedInterests,
      selectedFont: selectedFont ?? undefined,
      selectedAnimation: selectedAnimation ?? undefined,
      userContext: userContext ?? undefined,
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
      theme: mergeAiTheme(baseTheme, sanitizeThemeTokens(clientRaw as ThemeTokens), {
        preferBaseColors,
      }),
      source: 'client',
    };
  }
  if (cloudTheme) {
    return {
      theme: mergeAiTheme(baseTheme, sanitizeThemeTokens(cloudTheme), { preferBaseColors }),
      source: 'cloud',
    };
  }

  const vibe =
    selectedVibe ||
    detectVibeFromPrompt(effectivePrompt || prompt) ||
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
