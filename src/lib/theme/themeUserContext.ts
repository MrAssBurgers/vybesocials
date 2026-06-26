import type { ThemeTokens } from '@/hooks/useCustomTheme';
import type { VybeDNA } from '@/hooks/useVybeDNA';

const ADAPTATION_STORAGE_KEY = 'vybe_user_adaptation';

export interface ThemeUserContext {
  username?: string;
  displayName?: string;
  bio?: string;
  interests?: string[];
  signatureColors?: string[];
  glyphPattern?: string;
  personalityVector?: Record<string, number>;
  engagementScore?: number;
  auraIntensity?: number;
  currentThemeName?: string;
  currentPrimary?: string;
  currentAccent?: string;
  communicationStyle?: string;
  emojiUsage?: string;
  frequentTopics?: string[];
  modePreference?: 'dark' | 'light';
}

type ProfileLike = {
  username?: string | null;
  display_name?: string | null;
  bio?: string | null;
  interests?: string[] | null;
};

function readAdaptationHints(): Pick<
  ThemeUserContext,
  'communicationStyle' | 'emojiUsage' | 'frequentTopics' | 'interests'
> {
  try {
    const raw = localStorage.getItem(ADAPTATION_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as {
      communicationStyle?: string;
      emojiUsage?: string;
      frequentTopics?: string[];
      interests?: string[];
    };
    return {
      communicationStyle: parsed.communicationStyle,
      emojiUsage: parsed.emojiUsage,
      frequentTopics: parsed.frequentTopics?.slice(0, 6),
      interests: parsed.interests?.slice(0, 8),
    };
  } catch {
    return {};
  }
}

function resolveModePreference(): 'dark' | 'light' {
  try {
    let mode = localStorage.getItem('xd-theme') || 'dark';
    if (mode === 'system') {
      mode =
        window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light';
    }
    return mode === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function collectThemeUserContext(input: {
  profile?: ProfileLike | null;
  dna?: VybeDNA | null;
  equippedTheme?: ThemeTokens | null;
}): ThemeUserContext | null {
  const adaptation = readAdaptationHints();
  const profile = input.profile;
  const dna = input.dna;
  const equipped = input.equippedTheme;

  const interests = [
    ...(profile?.interests ?? []),
    ...(dna?.interests ?? []),
    ...(adaptation.interests ?? []),
  ]
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .slice(0, 10);

  const ctx: ThemeUserContext = {
    username: profile?.username ?? undefined,
    displayName: profile?.display_name ?? undefined,
    bio: profile?.bio?.trim() || undefined,
    interests: interests.length ? interests : undefined,
    signatureColors: dna?.signature_colors?.slice(0, 4),
    glyphPattern: dna?.glyph_pattern,
    personalityVector: dna?.personality_vector,
    engagementScore: dna?.engagement_score,
    auraIntensity: dna?.aura_intensity,
    currentThemeName: equipped?.themeName,
    currentPrimary: equipped?.colorPrimary,
    currentAccent: equipped?.colorAccent,
    communicationStyle: adaptation.communicationStyle,
    emojiUsage: adaptation.emojiUsage,
    frequentTopics: adaptation.frequentTopics,
    modePreference: resolveModePreference(),
  };

  const hasSignal = Boolean(
    ctx.bio ||
      ctx.interests?.length ||
      ctx.signatureColors?.length ||
      ctx.personalityVector ||
      ctx.currentPrimary ||
      ctx.displayName ||
      ctx.username,
  );

  return hasSignal ? ctx : null;
}

export function hasThemeUserContext(ctx: ThemeUserContext | null | undefined): boolean {
  return Boolean(ctx && Object.values(ctx).some((v) => (Array.isArray(v) ? v.length > 0 : Boolean(v))));
}

/** Natural-language block appended to AI theme prompts. */
export function formatThemeUserContext(ctx: ThemeUserContext | null | undefined): string {
  if (!ctx) return '';

  const lines: string[] = ['What VYBE knows about this user (personalize the theme to match):'];

  if (ctx.displayName || ctx.username) {
    lines.push(`- Name: ${ctx.displayName || ctx.username}${ctx.username ? ` (@${ctx.username})` : ''}`);
  }
  if (ctx.bio) lines.push(`- Bio: ${ctx.bio.slice(0, 280)}`);
  if (ctx.interests?.length) lines.push(`- Interests: ${ctx.interests.join(', ')}`);
  if (ctx.signatureColors?.length) {
    lines.push(`- Vybe DNA signature colors: ${ctx.signatureColors.join(', ')}`);
  }
  if (ctx.glyphPattern) lines.push(`- Vybe DNA visual pattern: ${ctx.glyphPattern}`);
  if (ctx.personalityVector && Object.keys(ctx.personalityVector).length) {
    const traits = Object.entries(ctx.personalityVector)
      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
      .slice(0, 5)
      .map(([k, v]) => `${k} ${Math.round((v ?? 0) * 100)}%`)
      .join(', ');
    lines.push(`- Personality mix: ${traits}`);
  }
  if (typeof ctx.engagementScore === 'number') {
    lines.push(`- Engagement style score: ${Math.round(ctx.engagementScore * 100)}%`);
  }
  if (ctx.communicationStyle) lines.push(`- Communication style: ${ctx.communicationStyle}`);
  if (ctx.emojiUsage) lines.push(`- Emoji usage: ${ctx.emojiUsage}`);
  if (ctx.frequentTopics?.length) {
    lines.push(`- Topics they talk about: ${ctx.frequentTopics.join(', ')}`);
  }
  if (ctx.currentThemeName || ctx.currentPrimary) {
    lines.push(
      `- Current equipped theme: ${ctx.currentThemeName || 'custom'} (primary ${ctx.currentPrimary || '?'}, accent ${ctx.currentAccent || '?'}) — evolve or refine, do not ignore unless the user asks for something totally different`,
    );
  }
  if (ctx.modePreference) lines.push(`- Preferred UI mode: ${ctx.modePreference}`);

  return lines.length > 1 ? lines.join('\n') : '';
}

/** Default generation ask when the user did not type a custom prompt. */
export function defaultThemePromptFromContext(ctx: ThemeUserContext | null | undefined): string {
  if (!hasThemeUserContext(ctx)) {
    return 'Create a distinctive, immersive VYBE social app theme with excellent text contrast.';
  }
  return [
    'Design a cohesive, personalized VYBE app theme that feels uniquely mine.',
    'Use everything you know about my profile, Vybe DNA, interests, and personality.',
    'The palette should feel like an extension of who I am on VYBE — immersive, modern, and readable.',
  ].join(' ');
}
