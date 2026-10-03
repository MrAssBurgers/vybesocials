import { describe, expect, it } from 'vitest';
import { decodePageTitleSegment } from './usePageTitle';

describe('shared-link page titles', () => {
  it('decodes valid handles and trims padding', () => {
    expect(decodePageTitleSegment('%40creator%20')).toBe('@creator');
    expect(decodePageTitleSegment('hello%20world')).toBe('hello world');
  });
  it('keeps malformed percent escapes from crashing the app', () => {
    expect(decodePageTitleSegment('%E0%A4%A')).toBe('%E0%A4%A');
    expect(decodePageTitleSegment('100%')).toBe('100%');
    expect(decodePageTitleSegment('')).toBe('');
  });
});
