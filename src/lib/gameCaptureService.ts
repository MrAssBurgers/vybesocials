import { getBlob, getStorage, ref } from 'firebase/storage';
import { z } from 'zod';
import { getFirebaseApp } from '@/lib/firebase/app';
import { invokeFunction } from '@/lib/firebase/functionsService';
import type { CaptureReceipt } from '../../sdk/game';

export type { CaptureReceipt };

export class GameCaptureError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'GameCaptureError'; }
}

const receiptSchema = z.object({
  captureId: z.string().regex(/^[a-f0-9]{48}$/),
  status: z.enum(['uploading', 'ready', 'imported', 'cancelled', 'expired']),
  gameId: z.string().regex(/^[a-z0-9][a-z0-9_-]{2,63}$/), gameName: z.string().min(1).max(200),
  contentType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/webm']),
  byteSize: z.number().int().min(12).max(48 * 1024 * 1024), caption: z.string().max(2200),
  tags: z.array(z.string().max(40)).max(10), storagePath: z.string(),
  expiresAt: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), postId: z.string().nullable(),
});

function validId(id: string) {
  if (!/^[a-f0-9]{48}$/.test(id)) throw new GameCaptureError('invalid-argument', 'This capture link is invalid. Open a fresh link from your game.');
}

async function call(name: string, data: Record<string, unknown>): Promise<unknown> {
  const result = await invokeFunction<unknown>(name, data);
  if (result.error) throw new GameCaptureError(result.error.code || result.error.name || 'unknown', result.error.message || 'The game capture could not be loaded.');
  return result.data;
}

function receipt(value: unknown, captureId: string): CaptureReceipt {
  const parsed = receiptSchema.safeParse(value);
  if (!parsed.success || parsed.data.captureId !== captureId
    || !new RegExp(`^game-captures/[^/]+/${captureId}$`).test(parsed.data.storagePath)
    || (parsed.data.status === 'imported' ? parsed.data.postId !== `game_${captureId}` : parsed.data.postId !== null)) {
    throw new GameCaptureError('invalid-response', 'Capture details could not be verified. Please try again.');
  }
  // Zod validated every required field above. The app's non-strict TS config
  // otherwise widens inferred object properties to optional.
  return { ...parsed.data, reviewUrl: `https://vybehub.app/game-capture/${captureId}` } as CaptureReceipt;
}

export async function getGameCapture(captureId: string): Promise<CaptureReceipt> {
  validId(captureId); return receipt(await call('getGameCapture', { captureId }), captureId);
}
export async function completeGameCapture(captureId: string, postId: string): Promise<CaptureReceipt> {
  validId(captureId);
  if (postId !== `game_${captureId}`) throw new GameCaptureError('invalid-argument', 'This post does not match the capture.');
  const result = receipt(await call('completeGameCapture', { captureId, postId }), captureId);
  if (result.status !== 'imported') throw new GameCaptureError('invalid-response', 'Your post receipt has not synced yet.');
  return result;
}
export async function discardGameCapture(captureId: string): Promise<{ ok: true }> {
  validId(captureId); const result = await call('discardGameCapture', { captureId });
  if (!result || typeof result !== 'object' || !('ok' in result) || result.ok !== true) throw new GameCaptureError('invalid-response', 'Discard was not confirmed. Please try again.');
  return { ok: true };
}

export function gameCaptureErrorMessage(error: unknown, fallback = 'Could not load this capture. Please try again.'): string {
  if (error instanceof GameCaptureError) {
    switch (error.code.replace(/^functions\//, '')) {
      case 'unauthenticated': return 'Sign in again to review this capture.';
      case 'permission-denied': return 'This capture is not available to your account.';
      case 'not-found': return 'Capture not found for this account. Check that you signed in with the account linked in your game.';
      case 'resource-exhausted': return 'Too many requests. Wait a moment, then try again.';
      case 'unavailable': case 'deadline-exceeded': case 'internal': return 'VYBE could not be reached. Check your connection and try again.';
      default: return error.message || fallback;
    }
  }
  return error instanceof Error ? error.message : fallback;
}

export async function downloadGameCapture(capture: CaptureReceipt): Promise<File> {
  receipt(capture, capture.captureId);
  if (capture.status !== 'ready' || capture.expiresAt <= Date.now()) throw new GameCaptureError('failed-precondition', 'This capture is no longer available for review. Create a new capture in your game.');
  // Authenticated download, not a public bearer-token URL. Storage rules check
  // account ownership and expiry again, including after a user switches accounts.
  const blob = await getBlob(ref(getStorage(getFirebaseApp()), capture.storagePath), 48 * 1024 * 1024);
  // Firebase bounds getBlob by calling blob.slice without a MIME argument,
  // which clears Blob.type. The ready receipt's MIME was verified server-side
  // against immutable Storage metadata and file signature. Still reject any
  // conflicting MIME that the SDK does supply, and always verify exact size.
  if (blob.size !== capture.byteSize || (blob.type !== '' && blob.type !== capture.contentType)) throw new Error('Capture details changed. Please try again.');
  const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/webm': 'webm' }[capture.contentType];
  return new File([blob], `game-capture.${extension}`, { type: capture.contentType });
}
