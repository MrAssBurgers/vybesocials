import { describe, expect, it } from 'vitest';
import { isVideoPostMedia } from './isVideoPostMedia';

describe('clip media type', () => {
  it('plays admitted videos even when Storage or signed URLs have no extension', () => {
    for (const type of ['short', 'video']) expect(isVideoPostMedia({ type, media_url: 'https://firebasestorage.googleapis.com/v0/b/vybe/o/media%2Fopaque-id?alt=media' })).toBe(true);
  });
  it('does not turn an admitted image into a video because its link mentions mp4', () => {
    expect(isVideoPostMedia({ type: 'image', media_url: 'https://example.test/picture?caption=.mp4' })).toBe(false);
  });
  it('keeps older typed filenames working, including encoded and uppercase paths', () => {
    expect(isVideoPostMedia({ media_url: 'https://example.test/media%2Fclip.MP4?token=example' })).toBe(true);
    expect(isVideoPostMedia({ media_url: 'https://example.test/image.jpg?caption=.mp4' })).toBe(false);
    expect(isVideoPostMedia({ media_url: '%' })).toBe(false);
  });
});
