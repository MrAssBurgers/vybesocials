import { describe, expect, it } from 'vitest';
import {
  ThemePatchStreamParser,
  defaultThemePatchBase,
  hasEnoughCorePatches,
  mergeThemePatch,
  parseThemeCssVarTemplate,
  parseThemePatchLine,
  stripMarkdownFences,
} from './partialThemeUpdate';

describe('partialThemeUpdate', () => {
  it('parses set and done NDJSON lines', () => {
    const set = parseThemePatchLine(
      '{"op":"set","colorPrimary":"330 100% 60%","bgMain":"240 10% 4%"}',
    );
    expect(set?.op).toBe('set');
    expect(set?.colorPrimary).toBe('330 100% 60%');
    expect(set?.bgMain).toBe('240 10% 4%');

    const done = parseThemePatchLine('{"op":"done","themeName":"Neon Coral"}');
    expect(done?.op).toBe('done');
    expect(done?.themeName).toBe('Neon Coral');
  });

  it('drops unknown keys and invalid HSL', () => {
    const patch = parseThemePatchLine(
      '{"op":"set","colorPrimary":"330 100% 60%","evil":"<script>","backgroundImage":"https://evil.test/x.png","colorAccent":"not-hsl"}',
    );
    expect(patch).toEqual({ op: 'set', colorPrimary: '330 100% 60%' });
  });

  it('rejects empty / non-json lines', () => {
    expect(parseThemePatchLine('')).toBeNull();
    expect(parseThemePatchLine('hello')).toBeNull();
    expect(parseThemePatchLine('{"op":"set"}')).toBeNull();
  });

  it('merges patches onto a base theme', () => {
    const base = defaultThemePatchBase('classic');
    const merged = mergeThemePatch(base, {
      op: 'set',
      colorPrimary: '10 90% 55%',
      mode: 'light',
    });
    expect(merged.colorPrimary).toBe('10 90% 55%');
    expect(merged.mode).toBe('light');
    // sanitize may adapt bg for light mode — primary change must stick
    expect(merged.colorPrimary).not.toBe(base.colorPrimary);
  });

  it('buffers incomplete NDJSON across chunks', () => {
    const parser = new ThemePatchStreamParser();
    expect(parser.push('{"op":"set","colorPrimary":"330')).toEqual([]);
    const mid = parser.push(' 100% 60%"}\n{"op":"set","bgMain":');
    expect(mid).toHaveLength(1);
    expect(mid[0].colorPrimary).toBe('330 100% 60%');
    const rest = parser.push('"240 10% 4%"}\n');
    expect(rest).toHaveLength(1);
    expect(rest[0].bgMain).toBe('240 10% 4%');
  });

  it('strips markdown fences and flushes trailing object', () => {
    expect(stripMarkdownFences('```json\n{"a":1}\n```')).toContain('{"a":1}');
    const parser = new ThemePatchStreamParser();
    parser.push('```\n');
    parser.push('{"op":"done","themeName":"Aurora","colorPrimary":"200 80% 50%","bgMain":"220 40% 8%","colorAccent":"170 70% 45%"}');
    const flushed = parser.flush();
    expect(flushed).toHaveLength(1);
    expect(flushed[0].themeName).toBe('Aurora');
  });

  it('requires three core patch keys', () => {
    expect(hasEnoughCorePatches(new Set(['colorPrimary', 'bgMain']))).toBe(false);
    expect(
      hasEnoughCorePatches(new Set(['colorPrimary', 'bgMain', 'colorAccent'])),
    ).toBe(true);
  });

  it('parses constrained CSS var templates', () => {
    const patch = parseThemeCssVarTemplate(`
      <template for="/theme/css-vars">
        <style id="vybe-theme-stream">:root{--primary:330 100% 60%;--background:240 10% 4%;}</style>
      </template>
    `);
    expect(patch?.colorPrimary).toBe('330 100% 60%');
    expect(patch?.bgMain).toBe('240 10% 4%');
    expect(parseThemeCssVarTemplate('<script>alert(1)</script>')).toBeNull();
  });
});
