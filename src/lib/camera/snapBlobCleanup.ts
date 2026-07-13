/**
 * Local blob lifecycle for snap drafts — revoke object URLs when safe so
 * camera captures do not leak memory or linger after delivery.
 */
import type { SnapMediaDraft } from '@/lib/camera/snapDraft';

/** Failed offline drafts expire after this window unless the user retries. */
export const FAILED_SNAP_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function isRevocableLocalUri(uri: string | null | undefined): uri is string {
  return typeof uri === 'string' && uri.startsWith('blob:');
}

export function revokeLocalUri(uri: string | null | undefined): void {
  if (!isRevocableLocalUri(uri)) return;
  try {
    URL.revokeObjectURL(uri);
  } catch {
    /* ignore */
  }
}

export function revokeDraftLocalUri(draft: Pick<SnapMediaDraft, 'localUri'>): void {
  revokeLocalUri(draft.localUri);
}

export function isFailedDraftExpired(
  draft: Pick<SnapMediaDraft, 'createdAt'>,
  now = Date.now(),
): boolean {
  return now - draft.createdAt > FAILED_SNAP_DRAFT_TTL_MS;
}
