import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ edge: vi.fn(), bypass: vi.fn(), local: vi.fn(), scan: vi.fn(), frames: vi.fn() }));
vi.mock('@/lib/edgeFeature', () => ({ invokeEdgeFeature: mocks.edge }));
vi.mock('@/lib/ownerBypass', () => ({ shouldBypassSafety: mocks.bypass }));
vi.mock('@/lib/contentModeration', () => ({ containsBlockedContent: mocks.local }));
vi.mock('@/lib/nsfwScanner', () => ({ scanImage: mocks.scan, scanVideo: mocks.scan }));
vi.mock('./fileToVybeFrames', () => ({ fileToVybeFrames: mocks.frames }));
import { runPublishVybeCheck } from './runPublishVybeCheck';

const approved = { check_id: 'verified-check', status: 'approved', score: 0, categories: [], message: 'Check passed', allowed: true, requires_review: false, limited: false };
const unavailableMessage = 'Vybe Check is unavailable right now. Your content has not been published. Please try again later.';
beforeEach(() => {
  vi.clearAllMocks(); mocks.bypass.mockResolvedValue(false); mocks.local.mockReturnValue({ blocked: false });
  mocks.scan.mockResolvedValue({ result: 'safe' }); mocks.frames.mockResolvedValue([{ base64: 'fixture', mime_type: 'image/png' }]);
  mocks.edge.mockResolvedValue({ data: approved, unavailable: false });
});

describe('publish safety service failures', () => {
  it.each(['not-found [404]', 'Feature not available yet', 'INTERNAL: private provider detail', 'unavailable', undefined])('keeps publishing blocked with useful copy instead of provider detail %j', async errorMessage => {
    mocks.edge.mockResolvedValue({ data: null, unavailable: true, errorMessage });
    expect(await runPublishVybeCheck({ caption: 'Hello', contentType: 'text' })).toEqual({
      allowed: false, blocked: true, message: unavailableMessage, categories: ['vybe_check_unavailable'], ageRating: 'safe',
    });
  });
  it('also fails closed when an endpoint returns no result without an unavailable flag', async () => {
    mocks.edge.mockResolvedValue({ data: null, unavailable: false });
    expect(await runPublishVybeCheck({ caption: 'Hello' })).toMatchObject({ allowed: false, blocked: true, message: unavailableMessage });
  });
  it('preserves the media pre-scan and server scan without approving a missing provider', async () => {
    mocks.edge.mockResolvedValue({ data: null, unavailable: true, errorMessage: 'not-found [404]' });
    const file = new File([new Uint8Array(12)], 'capture.png', { type: 'image/png' });
    expect(await runPublishVybeCheck({ caption: '', mediaFile: file })).toMatchObject({ allowed: false, blocked: true, message: unavailableMessage });
    expect(mocks.scan).toHaveBeenCalledWith(file); expect(mocks.frames).toHaveBeenCalledWith(file);
    expect(mocks.edge).toHaveBeenCalledWith('start-vybe-check', expect.objectContaining({ content_type: 'post', frames: [{ base64: 'fixture', mime_type: 'image/png' }] }));
  });
  it.each([
    { ...approved, allowed: false, status: 'rejected', message: 'Revise the prohibited content.', categories: ['violence'] },
    { ...approved, status: 'needs_review', requires_review: true, message: 'This needs a review.', categories: ['review'] },
  ])('preserves an actual moderation decision and its explanation', async decision => {
    mocks.edge.mockResolvedValue({ data: decision, unavailable: false });
    expect(await runPublishVybeCheck({ caption: 'Hello' })).toMatchObject({ allowed: false, blocked: true, message: decision.message, categories: decision.categories, checkId: 'verified-check' });
  });
  it('preserves approved and limited results and their rating', async () => {
    expect(await runPublishVybeCheck({ caption: 'Hello' })).toMatchObject({ allowed: true, blocked: false, ageRating: 'safe', checkId: 'verified-check' });
    mocks.edge.mockResolvedValue({ data: { ...approved, status: 'limited', limited: true }, unavailable: false });
    expect(await runPublishVybeCheck({ caption: 'Hello' })).toMatchObject({ allowed: true, blocked: false, ageRating: '13+' });
  });
  it('preserves caption rejection before provider work', async () => {
    mocks.local.mockReturnValue({ blocked: true });
    expect(await runPublishVybeCheck({ caption: 'blocked' })).toMatchObject({ allowed: false, blocked: true, message: 'Your caption contains inappropriate content.', categories: ['caption'] });
    expect(mocks.edge).not.toHaveBeenCalled();
  });
  it('preserves a local media rejection and does not contact the server', async () => {
    mocks.scan.mockResolvedValue({ result: 'blocked', message: 'Media cannot be shared.', categories: ['media'] });
    expect(await runPublishVybeCheck({ caption: '', mediaFile: new File(['x'], 'x.png', { type: 'image/png' }) })).toMatchObject({ allowed: false, blocked: true, message: 'Media cannot be shared.', categories: ['media'] });
    expect(mocks.edge).not.toHaveBeenCalled();
  });
});
