import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FOLD_CAPPED_VIEWPORT, FOLD_TOUCH_VIEWPORT, nextFoldViewport } from './foldViewport';

describe('nextFoldViewport', () => {
  it('uses device-width on the Fold 8 cover and inner 4:3 screen', () => {
    expect(nextFoldViewport(475, false)).toEqual({
      content: FOLD_TOUCH_VIEWPORT,
      capping: false,
    });
    expect(nextFoldViewport(933, false)).toEqual({
      content: FOLD_TOUCH_VIEWPORT,
      capping: false,
    });
    expect(nextFoldViewport(704, false).content).not.toMatch(/maximum-scale|user-scalable/);
  });

  it('caps an unfolded shell that would cross the desktop breakpoint, without looping', () => {
    const capped = nextFoldViewport(1224, false);
    expect(capped).toEqual({ content: FOLD_CAPPED_VIEWPORT, capping: true });
    // After the cap, layout width is ~1000. Stay capped.
    expect(nextFoldViewport(1000, true)).toEqual({
      content: FOLD_CAPPED_VIEWPORT,
      capping: true,
    });
  });

  it('releases the cap when the cover screen is showing', () => {
    expect(nextFoldViewport(475, true)).toEqual({
      content: FOLD_TOUCH_VIEWPORT,
      capping: false,
    });
  });

  it('keeps the boot script on the same viewport strings', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    expect(html).toContain(FOLD_TOUCH_VIEWPORT);
    expect(html).toContain(FOLD_CAPPED_VIEWPORT);
    expect(html).toContain('width >= 1024');
    expect(html).toContain('width < 900');
    expect(html).toContain("classList.add('device-fold')");
  });
});
