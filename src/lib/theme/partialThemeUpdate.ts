/**
 * Constrained partial-update protocol for the AI theme designer.
 * Inspired by philholden/partialupdate markers — but only ThemeTokens / CSS vars,
 * never arbitrary HTML/JS.
 */
import {
  sanitizeThemeTokens,
  THEME_PRESETS,
  type ThemeTokens,
} from '@/hooks/useCustomTheme';

/** Keys the model may set via NDJSON patches. */
export const THEME_PATCH_KEYS = [
  'colorPrimary',
  'colorSecondary',
  'colorAccent',
  'bgMain',
  'bgCard',
  'bgGradientFrom',
  'bgGradientTo',
  'bgGradientMid',
  'sidebarBg',
  'navBg',
  'inputBg',
  'inputText',
  'buttonText',
  'glassBg',
  'glassBorder',
  'textPrimary',
  'textSecondary',
  'borderColor',
  'borderRadius',
  'mode',
  'themeName',
  'neonPink',
  'neonPurple',
  'neonCyan',
  'animationSpeed',
  'animationStyle',
  'backgroundEffect',
  'backgroundOverlay',
  'backgroundBlur',
  'backgroundOpacity',
] as const satisfies readonly (keyof ThemeTokens)[];

export type ThemePatchKey = (typeof THEME_PATCH_KEYS)[number];

const PATCH_KEY_SET = new Set<string>(THEME_PATCH_KEYS);

/** Core fields required before we trust a streamed theme (else fall back). */
export const THEME_CORE_PATCH_KEYS = ['colorPrimary', 'bgMain', 'colorAccent'] as const;

export type ThemePatchOp = 'set' | 'done';

export type ThemeTokenPatch = {
  op: ThemePatchOp;
} & Partial<Pick<ThemeTokens, ThemePatchKey>>;

const BORDER_RADIUS = new Set(['small', 'medium', 'large']);
const MODES = new Set(['light', 'dark']);
const ANIM_SPEEDS = new Set(['slow', 'normal', 'fast', 'instant']);
const ANIM_STYLES = new Set(['smooth', 'bouncy', 'snappy', 'none']);
const BG_EFFECTS = new Set([
  'none',
  'particles',
  'stars',
  'bubbles',
  'aurora',
  'rain',
  'snow',
  'fireflies',
  'geometric',
]);

/** Loose HSL triplet: "330 100% 60%" or with commas. */
const HSL_TRIPLET = /^\s*\d{1,3}(?:\.\d+)?\s+\d{1,3}(?:\.\d+)?%\s+\d{1,3}(?:\.\d+)?%\s*$/;

function isHslTriplet(value: unknown): value is string {
  return typeof value === 'string' && HSL_TRIPLET.test(value);
}

function coercePatchValue(key: ThemePatchKey, value: unknown): ThemeTokens[ThemePatchKey] | undefined {
  if (value == null) return undefined;

  switch (key) {
    case 'borderRadius':
      return typeof value === 'string' && BORDER_RADIUS.has(value)
        ? (value as ThemeTokens['borderRadius'])
        : undefined;
    case 'mode':
      return typeof value === 'string' && MODES.has(value)
        ? (value as ThemeTokens['mode'])
        : undefined;
    case 'animationSpeed':
      return typeof value === 'string' && ANIM_SPEEDS.has(value)
        ? (value as ThemeTokens['animationSpeed'])
        : undefined;
    case 'animationStyle':
      return typeof value === 'string' && ANIM_STYLES.has(value)
        ? (value as ThemeTokens['animationStyle'])
        : undefined;
    case 'backgroundEffect':
      return typeof value === 'string' && BG_EFFECTS.has(value)
        ? (value as ThemeTokens['backgroundEffect'])
        : undefined;
    case 'themeName':
      return typeof value === 'string' && value.trim().length > 0 && value.length < 80
        ? value.trim().slice(0, 60)
        : undefined;
    case 'backgroundBlur':
    case 'backgroundOpacity': {
      const n = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(n)) return undefined;
      if (key === 'backgroundBlur') return Math.max(0, Math.min(20, Math.round(n)));
      return Math.max(0, Math.min(100, Math.round(n)));
    }
    default:
      // Color / HSL fields
      if (isHslTriplet(value)) return value.trim().replace(/,/g, ' ').replace(/\s+/g, ' ');
      return undefined;
  }
}

/** Strip markdown fences the model sometimes wraps around NDJSON. */
export function stripMarkdownFences(text: string): string {
  return text
    .replace(/^```(?:json|ndjson|html)?\s*/gim, '')
    .replace(/```\s*$/gim, '');
}

/**
 * Parse one NDJSON line into a sanitized patch, or null if invalid / empty.
 * Unknown keys are dropped (not rejected with throw — stream stays resilient).
 */
export function parseThemePatchLine(line: string): ThemeTokenPatch | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const obj = raw as Record<string, unknown>;
  const opRaw = obj.op;
  const op: ThemePatchOp =
    opRaw === 'done' ? 'done' : opRaw === 'set' || opRaw == null ? 'set' : 'set';

  const patch: ThemeTokenPatch = { op };
  let hasField = op === 'done';

  for (const [key, value] of Object.entries(obj)) {
    if (key === 'op') continue;
    if (!PATCH_KEY_SET.has(key)) continue;
    const coerced = coercePatchValue(key as ThemePatchKey, value);
    if (coerced === undefined) continue;
    (patch as Record<string, unknown>)[key] = coerced;
    hasField = true;
  }

  return hasField ? patch : null;
}

export function mergeThemePatch(base: ThemeTokens, patch: ThemeTokenPatch): ThemeTokens {
  const next: ThemeTokens = { ...base };
  for (const key of THEME_PATCH_KEYS) {
    if (key in patch && patch[key] !== undefined) {
      (next as Record<string, unknown>)[key] = patch[key];
    }
  }
  return sanitizeThemeTokens(next);
}

export function countCorePatchKeys(theme: ThemeTokens, seenFromPatches?: Set<string>): number {
  if (seenFromPatches) {
    return THEME_CORE_PATCH_KEYS.filter((k) => seenFromPatches.has(k)).length;
  }
  return THEME_CORE_PATCH_KEYS.filter((k) => {
    const v = theme[k];
    return typeof v === 'string' && v.length > 0;
  }).length;
}

export function hasEnoughCorePatches(seenKeys: Set<string>): boolean {
  return THEME_CORE_PATCH_KEYS.filter((k) => seenKeys.has(k)).length >= 3;
}

export function defaultThemePatchBase(preset = 'classic'): ThemeTokens {
  return { ...(THEME_PRESETS[preset] || THEME_PRESETS.classic) };
}

/**
 * Incremental NDJSON buffer parser for streaming model output.
 */
export class ThemePatchStreamParser {
  private buffer = '';

  push(chunk: string): ThemeTokenPatch[] {
    if (!chunk) return [];
    this.buffer += chunk;
    const parts = this.buffer.split(/\r?\n/);
    const incomplete = /\r?\n$/.test(this.buffer) ? '' : (parts.pop() ?? '');
    this.buffer = incomplete;

    const patches: ThemeTokenPatch[] = [];
    for (const line of parts) {
      const cleaned = stripMarkdownFences(line).trim();
      if (!cleaned || cleaned === '```') continue;
      const patch = parseThemePatchLine(cleaned);
      if (patch) patches.push(patch);
    }
    return patches;
  }

  /** Flush any remaining complete JSON object in the buffer. */
  flush(): ThemeTokenPatch[] {
    const leftover = stripMarkdownFences(this.buffer).trim();
    this.buffer = '';
    if (!leftover || leftover === '```') return [];
    const patch = parseThemePatchLine(leftover);
    return patch ? [patch] : [];
  }
}

/**
 * Optional partialupdate-style CSS marker body.
 * Only `:root { --allowlisted: hsl-triplet }` declarations are accepted.
 */
const CSS_VAR_TO_TOKEN: Record<string, ThemePatchKey> = {
  '--primary': 'colorPrimary',
  '--secondary': 'colorSecondary',
  '--accent': 'colorAccent',
  '--background': 'bgMain',
  '--card': 'bgCard',
  '--foreground': 'textPrimary',
  '--muted-foreground': 'textSecondary',
  '--border': 'borderColor',
};

const CSS_DECL = /(--[a-z0-9-]+)\s*:\s*([^;}{]+)/gi;

export function parseThemeCssVarTemplate(html: string): ThemeTokenPatch | null {
  if (!html || /<script/i.test(html)) return null;
  const styleMatch = html.match(/<style\b[^>]*>([\s\S]*?)<\/style>/i);
  const css = styleMatch ? styleMatch[1] : html;
  if (!/:root/i.test(css) && !/--[a-z]/.test(css)) return null;

  const patch: ThemeTokenPatch = { op: 'set' };
  let found = false;
  let m: RegExpExecArray | null;
  CSS_DECL.lastIndex = 0;
  while ((m = CSS_DECL.exec(css)) !== null) {
    const cssVar = m[1].toLowerCase();
    const tokenKey = CSS_VAR_TO_TOKEN[cssVar];
    if (!tokenKey) continue;
    const rawVal = m[2].trim().replace(/^hsl\(\s*/i, '').replace(/\s*\)$/, '');
    const coerced = coercePatchValue(tokenKey, rawVal);
    if (coerced === undefined) continue;
    (patch as Record<string, unknown>)[tokenKey] = coerced;
    found = true;
  }
  return found ? patch : null;
}

/** Human label for the latest patch keys (designer build UI). */
export function describeThemePatch(patch: ThemeTokenPatch): string {
  if (patch.op === 'done') {
    return patch.themeName ? `Finishing “${patch.themeName}”` : 'Polishing details';
  }
  if (patch.colorPrimary || patch.colorAccent || patch.bgMain) return 'Mixing your palette';
  if (patch.animationSpeed || patch.animationStyle) return 'Tuning motion';
  if (patch.textPrimary || patch.borderRadius) return 'Polishing details';
  if (patch.mode) return 'Reading your vibe';
  return 'Mixing your palette';
}
