import { describe, expect, it } from 'vitest';
import { photoEnhancementFilter } from './photoEnhancement';

describe('photoEnhancementFilter', () => {
  it('provides a real filter for every visible preset', () => {
    for (const preset of ['auto', 'vibrant', 'portrait', 'aesthetic', 'hdr', 'clean'] as const) {
      expect(photoEnhancementFilter(preset)).toMatch(/(brightness|contrast|saturate)/);
    }
  });

  it('keeps presets visually distinct', () => {
    expect(new Set([
      photoEnhancementFilter('auto'),
      photoEnhancementFilter('vibrant'),
      photoEnhancementFilter('portrait'),
      photoEnhancementFilter('aesthetic'),
      photoEnhancementFilter('hdr'),
      photoEnhancementFilter('clean'),
    ]).size).toBe(6);
  });
});
