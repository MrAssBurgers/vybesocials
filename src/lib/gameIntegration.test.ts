import { describe, expect, it, vi } from 'vitest';
import { MAX_GAME_CAPTURE_BYTES, matchesGameCaptureSignature, validateGameCaptureId, validateGameCaptureInput } from '../../functions/src/gameIntegrationValidation';
import { VybeGameClient, type CaptureReceipt, type GameCaptureTransport, type CaptureRequest } from '../../sdk/game';

const valid = { gameId: 'neon-rally', idempotencyKey: 'capture_12345678', contentType: 'image/png' as const, byteSize: 100, caption: '  Winner!  ', tags: ['racing', 'racing'] };
const receipt: CaptureReceipt = { captureId: 'a'.repeat(48), status: 'uploading', gameId: 'neon-rally', gameName: 'Neon Rally', contentType: 'image/png', byteSize: 100, caption: 'Winner!', tags: ['racing'], storagePath: `game-captures/player/${'a'.repeat(48)}`, expiresAt: Date.now() + 1000, reviewUrl: `https://vybehub.app/game-capture/${'a'.repeat(48)}`, postId: null };
const input: CaptureRequest = { gameId: valid.gameId, idempotencyKey: valid.idempotencyKey, contentType: 'image/png', media: new Uint8Array(100) };

describe('game capture trust boundary', () => {
  it('normalizes caption and deduplicates safe tags', () => {
    expect(validateGameCaptureInput(valid)).toMatchObject({ caption: 'Winner!', tags: ['racing'] });
  });
  it.each([
    { gameId: '../other' }, { gameId: 'https://game.example' }, { idempotencyKey: 'short' },
    { idempotencyKey: '../malicious/path' }, { contentType: 'image/svg+xml' }, { contentType: 'text/html' },
    { contentType: 'image/png; charset=utf8' }, { byteSize: Infinity }, { byteSize: 1.5 }, { byteSize: '100' },
    { byteSize: MAX_GAME_CAPTURE_BYTES + 1 }, { byteSize: 0 }, { byteSize: -100 },
    { caption: 'x'.repeat(2201) }, { caption: {} }, { tags: Array(11).fill('tag') },
    { tags: ['<script>'] }, { tags: [null] }, { tags: ['x'.repeat(41)] },
  ])('rejects malformed or unbounded inputs %j', change => {
    expect(() => validateGameCaptureInput({ ...valid, ...change })).toThrow();
  });
  it('rejects traversal and unknown capture identifiers', () => {
    expect(() => validateGameCaptureId('../../posts/a')).toThrow();
    expect(() => validateGameCaptureId('a'.repeat(49))).toThrow();
    expect(validateGameCaptureId('a'.repeat(48))).toBe('a'.repeat(48));
  });
  it.each([
    ['image/png', [137, 80, 78, 71, 13, 10, 26, 10]],
    ['image/jpeg', [255, 216, 255]],
    ['image/webp', [82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]],
    ['video/mp4', [0, 0, 0, 32, 102, 116, 121, 112, 109, 112, 52, 49]],
    ['video/webm', [26, 69, 223, 163]],
  ])('checks %s magic bytes', (mime, bytes) => {
    expect(matchesGameCaptureSignature(new Uint8Array(bytes as number[]), mime as string)).toBe(true);
    expect(matchesGameCaptureSignature(new TextEncoder().encode('<html>not media</html>'), mime as string)).toBe(false);
  });
  it('does not confuse a WAV RIFF container with WebP', () => {
    expect(matchesGameCaptureSignature(new TextEncoder().encode('RIFF0000WAVE'), 'image/webp')).toBe(false);
  });
});

describe('game capture SDK', () => {
  function setup() {
    const call = vi.fn(); const upload = vi.fn().mockResolvedValue(undefined);
    const sdk = new VybeGameClient({ call, upload } as GameCaptureTransport);
    return { sdk, call, upload };
  }
  it('stages a private upload and never publishes or opens the browser', async () => {
    const { sdk, call, upload } = setup();
    call.mockResolvedValueOnce(receipt).mockRejectedValueOnce({ details: { reason: 'upload-required' } }).mockResolvedValueOnce({ ...receipt, status: 'ready' });
    expect((await sdk.stageCapture(input)).status).toBe('ready');
    expect(call.mock.calls.map(([name]) => name)).toEqual(['createGameCapture', 'finishGameCapture', 'finishGameCapture']);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(sdk.getReviewUrl(receipt)).toBe(`https://vybehub.app/game-capture/${receipt.captureId}`);
  });
  it('resumes a completed upload after the original response was lost', async () => {
    const { sdk, call, upload } = setup();
    call.mockResolvedValueOnce(receipt).mockResolvedValueOnce({ ...receipt, status: 'ready' });
    await sdk.stageCapture(input);
    expect(upload).not.toHaveBeenCalled();
  });
  it('returns an already finished idempotent capture without another upload', async () => {
    const { sdk, call, upload } = setup();
    call.mockResolvedValueOnce({ ...receipt, status: 'ready' });
    await sdk.stageCapture(input);
    expect(call).toHaveBeenCalledTimes(1); expect(upload).not.toHaveBeenCalled();
  });
  it('does not upload when verification fails for an auth or content error', async () => {
    const { sdk, call, upload } = setup();
    call.mockResolvedValueOnce(receipt).mockRejectedValueOnce(new Error('Not your capture'));
    await expect(sdk.stageCapture(input)).rejects.toThrow('Not your capture');
    expect(upload).not.toHaveBeenCalled();
  });
  it('stops a cancelled request before any network call', async () => {
    const { sdk, call } = setup(); const controller = new AbortController(); controller.abort();
    await expect(sdk.stageCapture({ ...input, signal: controller.signal })).rejects.toThrow('cancelled');
    expect(call).not.toHaveBeenCalled();
  });
  it('rejects unsupported payloads before allocating a draft', async () => {
    const { sdk, call } = setup();
    await expect(sdk.stageCapture({ ...input, contentType: 'image/svg+xml' as CaptureRequest['contentType'] })).rejects.toThrow('format');
    await expect(sdk.stageCapture({ ...input, media: new Uint8Array(2) })).rejects.toThrow('48 MiB');
    expect(call).not.toHaveBeenCalled();
  });
});
