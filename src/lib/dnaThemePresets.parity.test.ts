import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { DNA_THEME_PRESETS } from '../../functions/src/_shared/dnaThemePresets';
it('server Auto-Pilot presets remain identical to the existing app preset catalog', () => {
  const source = readFileSync('src/hooks/useCustomTheme.ts', 'utf8');
  const catalog = source.match(/export const THEME_PRESETS: Record<string, ThemeTokens> = ([\s\S]*?\n});/)?.[1];
  expect(catalog).toBeTruthy();
  // Evaluate only the repository's literal preset object; never remote/user content.
  const client = Function(`return (${catalog})`)();
  for (const name of ['classic', 'midnight', 'neon', 'soft', 'cyberpunk', 'minimal']) expect(DNA_THEME_PRESETS[name]).toEqual(client[name]);
});
