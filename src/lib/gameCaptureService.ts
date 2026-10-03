import { getBlob, getStorage, ref } from 'firebase/storage';
import { getFirebaseApp } from '@/lib/firebase/app';
import { invokeFunction } from '@/lib/firebase/functionsService';
import type { CaptureReceipt } from '../../sdk/game';

export type { CaptureReceipt };

async function call<T>(name: string, data: Record<string, unknown>): Promise<T> {
  const result = await invokeFunction<T>(name, data);
  if (result.error) throw new Error(result.error.message || 'The game capture could not be loaded.');
  if (!result.data) throw new Error('No capture was returned.');
  return result.data;
}

export const getGameCapture = (captureId: string) => call<CaptureReceipt>('getGameCapture', { captureId });
export const completeGameCapture = (captureId: string, postId: string) => call<CaptureReceipt>('completeGameCapture', { captureId, postId });
export const discardGameCapture = (captureId: string) => call<{ ok: boolean }>('discardGameCapture', { captureId });

export async function downloadGameCapture(capture: CaptureReceipt): Promise<File> {
  // Authenticated download, not a public bearer-token URL. Storage rules check
  // account ownership and expiry again, including after a user switches accounts.
  const blob = await getBlob(ref(getStorage(getFirebaseApp()), capture.storagePath), 48 * 1024 * 1024);
  if (blob.size !== capture.byteSize || blob.type !== capture.contentType) throw new Error('Capture details changed. Please try again.');
  const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/webm': 'webm' }[capture.contentType];
  return new File([blob], `game-capture.${extension}`, { type: capture.contentType });
}
