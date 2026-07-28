/**
 * Stream theme token patches via Firebase AI (NDJSON), applying live as they arrive.
 */
import { getGenerativeModel } from 'firebase/ai';
import {
  DEFAULT_CHAT_MODEL,
  getFirebaseAI,
  isAiLogicConfigured,
} from '@/lib/firebase/aiLogic';
import {
  applyThemeTokens,
  sanitizeThemeTokens,
  setThemePreviewLock,
  type ThemeTokens,
} from '@/hooks/useCustomTheme';
import type { GeneratedTheme } from '@/lib/localVibeThemes';
import {
  defaultThemePatchBase,
  describeThemePatch,
  hasEnoughCorePatches,
  mergeThemePatch,
  parseThemeCssVarTemplate,
  ThemePatchStreamParser,
  type ThemeTokenPatch,
} from '@/lib/theme/partialThemeUpdate';

export const THEME_STREAM_SYSTEM = `You are an elite UI theme designer for the VYBE social app.

Respond with NDJSON only — one JSON object per line. No markdown, no commentary, no code fences.

Each line is a patch:
{"op":"set","mode":"dark","bgMain":"240 10% 4%"}
{"op":"set","colorPrimary":"330 100% 60%","colorAccent":"185 100% 50%"}
{"op":"set","bgCard":"240 10% 8%","textPrimary":"0 0% 98%","textSecondary":"240 5% 55%"}
{"op":"set","colorSecondary":"240 10% 12%","borderColor":"240 10% 18%","borderRadius":"medium"}
{"op":"set","backgroundEffect":"aurora","animationSpeed":"normal","animationStyle":"smooth"}
{"op":"done","themeName":"Creative Name Here"}

Rules:
- Emit core colors FIRST: mode, bgMain, colorPrimary, colorAccent (within the first 2-3 lines).
- Then secondary fields (bgCard, text*, borders, neon*, gradients, effects).
- End with exactly one {"op":"done","themeName":"..."}.
- HSL values MUST be triplets without hsl() wrapper, e.g. "330 100% 60%".
- Match brands/scenes literally. Do NOT default to purple unless asked.
- Ensure readable contrast between text and backgrounds.
- Allowed keys only: colorPrimary, colorSecondary, colorAccent, bgMain, bgCard, bgGradientFrom, bgGradientMid, bgGradientTo, sidebarBg, navBg, inputBg, inputText, buttonText, glassBg, glassBorder, textPrimary, textSecondary, borderColor, borderRadius, mode, themeName, neonPink, neonPurple, neonCyan, animationSpeed, animationStyle, backgroundEffect, backgroundOverlay, backgroundBlur, backgroundOpacity.
- Never emit HTML, JavaScript, URLs, or backgroundImage.`;

const STREAM_MS = 15_000;
const IDLE_MS = 12_000;

export interface StreamVybeThemeOptions {
  prompt: string;
  base?: ThemeTokens;
  signal?: AbortSignal;
  /** Called after each accepted patch with the merged theme + last patch meta. */
  onPatch?: (theme: ThemeTokens, meta: { patch: ThemeTokenPatch; label: string }) => void;
  /** When true (default), paint CSS vars on each patch. */
  applyLive?: boolean;
  streamDeadlineMs?: number;
}

export class ThemeStreamInsufficientError extends Error {
  constructor(message = 'Streamed theme missing core colors') {
    super(message);
    this.name = 'ThemeStreamInsufficientError';
  }
}

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw Object.assign(new Error('Theme stream aborted'), { name: 'AbortError' });
  }
}

/**
 * Stream NDJSON theme patches from Firebase AI and merge into a GeneratedTheme.
 * Throws ThemeStreamInsufficientError if fewer than 3 core colors arrived.
 */
export async function streamVybeTheme(
  options: StreamVybeThemeOptions,
): Promise<GeneratedTheme> {
  if (!isAiLogicConfigured()) {
    throw new Error('VYBE AI is not configured');
  }

  const {
    prompt,
    base = defaultThemePatchBase(),
    signal,
    onPatch,
    applyLive = true,
    streamDeadlineMs = STREAM_MS,
  } = options;

  assertNotAborted(signal);

  const model = getGenerativeModel(getFirebaseAI(), {
    model: DEFAULT_CHAT_MODEL,
    systemInstruction: THEME_STREAM_SYSTEM,
    generationConfig: {
      temperature: 0.75,
      maxOutputTokens: 1536,
      topP: 0.95,
    },
  });

  const result = await model.generateContentStream({
    contents: [{ role: 'user', parts: [{ text: `Design request:\n${prompt}` }] }],
  });

  const parser = new ThemePatchStreamParser();
  let theme: ThemeTokens = { ...base };
  const seenKeys = new Set<string>();
  let fullText = '';
  const deadline = Date.now() + streamDeadlineMs;
  let lastActivity = Date.now();
  let sawDone = false;

  const applyPatches = (patches: ThemeTokenPatch[]) => {
    for (const patch of patches) {
      theme = mergeThemePatch(theme, patch);
      for (const key of Object.keys(patch)) {
        if (key !== 'op') seenKeys.add(key);
      }
      const label = describeThemePatch(patch);
      if (applyLive) {
        setThemePreviewLock(true);
        applyThemeTokens(theme);
      }
      onPatch?.(theme, { patch, label });
      if (patch.op === 'done') sawDone = true;
    }
  };

  for await (const chunk of result.stream) {
    assertNotAborted(signal);
    if (Date.now() > deadline) {
      throw Object.assign(new Error('Theme stream timed out'), { name: 'AbortError' });
    }
    if (!fullText && Date.now() - lastActivity > IDLE_MS) {
      throw Object.assign(new Error('Theme stream idle timeout'), { name: 'AbortError' });
    }

    let raw = '';
    try {
      raw = chunk.text();
    } catch {
      continue;
    }
    if (!raw) continue;

    fullText += raw;
    lastActivity = Date.now();

    const ndjsonPatches = parser.push(raw);
    if (ndjsonPatches.length) {
      applyPatches(ndjsonPatches);
    } else if (/<template\s+for=["']\/theme\/css-vars["']/i.test(fullText)) {
      const cssPatch = parseThemeCssVarTemplate(fullText);
      if (cssPatch) applyPatches([cssPatch]);
    }
  }

  assertNotAborted(signal);
  applyPatches(parser.flush());

  if (!hasEnoughCorePatches(seenKeys) && fullText.trim()) {
    try {
      const maybe = JSON.parse(
        fullText.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim(),
      );
      const obj = maybe?.theme && typeof maybe.theme === 'object' ? maybe.theme : maybe;
      if (obj && typeof obj === 'object') {
        applyPatches([{ op: 'done', ...(obj as object) } as ThemeTokenPatch]);
      }
    } catch {
      /* ignore */
    }
  }

  if (!hasEnoughCorePatches(seenKeys)) {
    throw new ThemeStreamInsufficientError();
  }

  if (!sawDone && !theme.themeName) {
    theme = { ...theme, themeName: theme.themeName || 'Custom Theme' };
  }

  return sanitizeThemeTokens(theme) as GeneratedTheme;
}
