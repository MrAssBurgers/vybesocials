/** Small, dependency-free boundary shared with the game integration tests. */
export const MAX_GAME_CAPTURE_BYTES = 48 * 1024 * 1024;
export const GAME_CAPTURE_TTL_MS = 24 * 60 * 60 * 1000;
export const GAME_CAPTURE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/webm'];
export class GameCaptureValidationError extends Error {
}
export function validateGameCaptureInput(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw new GameCaptureValidationError('Capture details are required.');
    const data = raw;
    if (typeof data.gameId !== 'string' || !/^[a-z0-9][a-z0-9_-]{2,63}$/.test(data.gameId))
        throw new GameCaptureValidationError('Use a registered game ID.');
    if (typeof data.idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(data.idempotencyKey))
        throw new GameCaptureValidationError('Use a unique 8–128 character upload key.');
    if (typeof data.contentType !== 'string' || !GAME_CAPTURE_MIME_TYPES.includes(data.contentType))
        throw new GameCaptureValidationError('Choose a PNG, JPEG, WebP, MP4, or WebM capture.');
    if (typeof data.byteSize !== 'number' || !Number.isSafeInteger(data.byteSize) || data.byteSize < 12 || data.byteSize > MAX_GAME_CAPTURE_BYTES)
        throw new GameCaptureValidationError('Captures must be between 12 bytes and 48 MiB.');
    const caption = data.caption === undefined ? '' : data.caption;
    if (typeof caption !== 'string' || caption.length > 2200)
        throw new GameCaptureValidationError('Keep captions to 2,200 characters or fewer.');
    const tags = data.tags === undefined ? [] : data.tags;
    if (!Array.isArray(tags) || tags.length > 10 || tags.some(tag => typeof tag !== 'string' || !/^[\p{L}\p{N}_-]{1,40}$/u.test(tag)))
        throw new GameCaptureValidationError('Use up to 10 tags of 1–40 letters, numbers, underscores, or hyphens.');
    return {
        gameId: data.gameId,
        idempotencyKey: data.idempotencyKey,
        contentType: data.contentType,
        byteSize: data.byteSize,
        caption: caption.trim(),
        tags: [...new Set(tags)],
    };
}
export function validateGameCaptureId(value) {
    if (typeof value !== 'string' || !/^[a-f0-9]{48}$/.test(value))
        throw new GameCaptureValidationError('Invalid capture ID.');
    return value;
}
/** Sniff the container rather than trusting a caller-supplied Content-Type. */
export function matchesGameCaptureSignature(bytes, contentType) {
    const starts = (signature, offset = 0) => signature.every((byte, index) => bytes[index + offset] === byte);
    switch (contentType) {
        case 'image/png': return starts([137, 80, 78, 71, 13, 10, 26, 10]);
        case 'image/jpeg': return starts([255, 216, 255]);
        case 'image/webp': return starts([82, 73, 70, 70]) && starts([87, 69, 66, 80], 8);
        case 'video/mp4': return bytes.length >= 12 && starts([102, 116, 121, 112], 4);
        case 'video/webm': return starts([26, 69, 223, 163]);
        default: return false;
    }
}
//# sourceMappingURL=gameIntegrationValidation.js.map