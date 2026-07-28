import { describe, expect, it } from 'vitest';
import { canPublishCreatePost, resolvePublishContentType } from './createPublishReady';

describe('canPublishCreatePost', () => {
  it('enables text posts with a non-empty caption and no media', () => {
    expect(
      canPublishCreatePost({
        contentType: 'text',
        caption: '[QA TEST] Production text-post canary — 2026-07-28.',
        fileCount: 0,
      }),
    ).toBe(true);
  });

  it('enables caption-only when contentType is still post but files are empty', () => {
    expect(
      canPublishCreatePost({
        contentType: 'post',
        caption: 'hello world',
        fileCount: 0,
      }),
    ).toBe(true);
  });

  it('rejects empty/whitespace text', () => {
    expect(canPublishCreatePost({ contentType: 'text', caption: '   ', fileCount: 0 })).toBe(false);
  });

  it('requires media for non-text when files are present', () => {
    expect(canPublishCreatePost({ contentType: 'post', caption: '', fileCount: 1 })).toBe(true);
    expect(canPublishCreatePost({ contentType: 'post', caption: '', fileCount: 0 })).toBe(false);
  });
});

describe('resolvePublishContentType', () => {
  it('forces text when there is no media', () => {
    expect(resolvePublishContentType({ contentType: 'post', fileCount: 0 })).toBe('text');
    expect(resolvePublishContentType({ contentType: 'text', fileCount: 0 })).toBe('text');
  });
});
