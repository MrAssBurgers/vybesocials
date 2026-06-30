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
  /** Raw textarea value — when set, always run Gemini instead of local keyword match. */
  typedPrompt?: string;
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
  /** True when user typed a prompt but AI paths failed. */
  aiFallback?: boolean;
}

const CLIENT_AI_MS = 6000;
const CLOUD_AI_MS = 22000;
/** Instant return when prompt clearly specifies colors/brand/scene (no typed prompt). */
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

/** Merge AI theme — AI colors always win when Gemini succeeded. */
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
    backgroundEffect: ai.backgroundEffect || base.backgroundEffect,
    animationSpeed: ai.animationSpeed || base.animationSpeed,
    animationStyle: ai.animationStyle || base.animationStyle,
  });
}

/**
 * Theme generation:
 * 1) Typed prompt → always call cloud AI (local parse = hints only)
 * 2) No typed prompt → instant brand / high-confidence local parse
 * 3) Cloud-first (22s), optional client refine in parallel
 * 4) Local fallback only when AI fails
 */
export async function generateVybeTheme(
  options: GenerateVybeThemeOptions,
): Promise<GenerateVybeThemeResult> {
  const {
    prompt,
    typedPrompt,
    basePreset = 'classic',
    selectedVibe,
    interests = [],
    selectedFont,
    selectedAnimation,
    userContext,
  } = options;

  const hasTypedPrompt = (typedPrompt ?? '').trim().length > 0;
  const typedText = (typedPrompt ?? '').trim();

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
  const brandId = detectBrandFromPrompt(hasTypedPrompt ? typedText : effectivePrompt || prompt);
  const brandTheme = brandId ? buildBrandTheme(brandId) : null;
  const brandHint = brandId ? brandThemePromptHint(brandId) : promptThemeAiHint(parsed);

  const userPrompt = [
    hasTypedPrompt ? `Primary request (match literally): ${typedText}` : effectivePrompt,
    contextBlock,
    brandHint,
    mergedInterests.length ? `Interests: ${mergedInterests.join(', ')}` : '',
    selectedFont ? `Font style: ${selectedFont}` : '',
    selectedAnimation ? `Animation: ${JSON.stringify(selectedAnimation)}` : '',
    `Base preset: ${basePreset}`,
  ]
    .filter(Boolean)
    .join('\n');

  // Known brands — instant palette even when user typed the brand name.
  if (brandId && brandTheme) {
    return {
      theme: sanitizeThemeTokens(brandTheme),
      source: 'brand',
    };
  }

  // Instant paths — only when user did not type a custom prompt in the textarea.
  if (!hasTypedPrompt) {
    if (parsed.confidence >= INSTANT_CONFIDENCE && effectivePrompt.length > 0) {
      return {
        theme: sanitizeThemeTokens(parsed.theme),
        source: 'prompt',
      };
    }
  }

  // Typed prompt or open-ended — run AI (cloud-first, client optional parallel).
  let cloudError: unknown;
  const baseTheme = parsed.theme;

  const cloudPromise = withTimeout(
    invokeFunction<{ theme?: GeneratedTheme; error?: string }>('generate-theme', {
      prompt: userPrompt,
      typedPrompt: hasTypedPrompt ? typedText : undefined,
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
      cloudError = err;
      console.warn('[generateVybeTheme] cloud failed', err);
      return null;
    });

  const clientPromise =
    isAiLogicConfigured() && !hasTypedPrompt
      ? withTimeout(generateThemeViaClientAi(userPrompt), CLIENT_AI_MS)
          .then((raw) => (raw && isValidGeneratedTheme(raw) ? raw : null))
          .catch((err) => {
            cloudError = cloudError ?? err;
            console.warn('[generateVybeTheme] client AI failed', err);
            return null;
          })
      : Promise.resolve(null);

  const [cloudTheme, clientRaw] = await Promise.all([cloudPromise, clientPromise]);

  if (cloudTheme) {
    return {
      theme: mergeAiTheme(baseTheme, sanitizeThemeTokens(cloudTheme)),
      source: 'cloud',
    };
  }
  if (clientRaw) {
    return {
      theme: mergeAiTheme(baseTheme, sanitizeThemeTokens(clientRaw as ThemeTokens)),
      source: 'client',
    };
  }

  const vibe =
    selectedVibe ||
    detectVibeFromPrompt(effectivePrompt || prompt) ||
    (basePreset && basePreset !== 'classic' ? basePreset : 'dark');
  const fallback = brandTheme ?? (parsed.confidence >= 0.4 ? parsed.theme : buildLocalVibeTheme(vibe));

  const cloudMsg = formatAiFeatureError(cloudError, '');
  const aiFailed = hasTypedPrompt;
  const notice = aiFailed
    ? cloudMsg && (cloudMsg.includes('GEMINI') || cloudMsg.includes('VYBE AI') || cloudMsg.includes('timeout'))
      ? `AI couldn't run — applied best local match. ${cloudMsg}`
      : "AI couldn't run — applied best local match from your words. Check connection or try again."
    : cloudMsg && (cloudMsg.includes('GEMINI') || cloudMsg.includes('VYBE AI') || cloudMsg.includes('timeout'))
      ? `Applied colors from your prompt. ${cloudMsg.includes('timeout') ? 'AI timed out — ' : ''}Palette matched locally.`
      : parsed.confidence >= 0.4
        ? undefined
        : `Applied "${fallback.themeName ?? 'custom'}" palette from your description.`;

  return {
    theme: sanitizeThemeTokens(fallback),
    source: brandTheme ? 'brand' : parsed.confidence >= 0.4 ? 'prompt' : 'local',
    notice,
    aiFallback: aiFailed,
  };
}
