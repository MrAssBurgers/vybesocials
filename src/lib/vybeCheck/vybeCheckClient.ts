import { invokeEdgeFeature } from '@/lib/edgeFeature';
import { framesToPayload, extractVideoFrames } from './extractVideoFrames';
import type { VybeCheckResult } from './types';

export interface StartVybeCheckVideoOptions {
  file: File;
  storagePath: string;
  contentId?: string;
  caption?: string;
  hashtags?: string[];
  ocrText?: string;
  /** Pre-extracted frames — skips client extraction when provided. */
  frames?: Awaited<ReturnType<typeof framesToPayload>>;
}

export async function startVybeCheckFrames(
  file: File,
  text?: { caption?: string; hashtags?: string[]; ocr_text?: string },
): Promise<{ result: VybeCheckResult | null; unavailable: boolean }> {
  const frames = await framesToPayload(await extractVideoFrames(file));
  const { data, unavailable } = await invokeEdgeFeature<VybeCheckResult>('start-vybe-check', {
    content_type: 'video',
    frames,
    text,
  });
  return { result: data, unavailable };
}

export async function startVybeCheckVideo(
  options: StartVybeCheckVideoOptions,
): Promise<{ result: VybeCheckResult | null; unavailable: boolean }> {
  const frames =
    options.frames ??
    (await framesToPayload(await extractVideoFrames(options.file)));

  const { data, unavailable } = await invokeEdgeFeature<VybeCheckResult>('start-vybe-check', {
    content_type: 'video',
    content_id: options.contentId,
    storage_path: options.storagePath,
    frames,
    text: {
      caption: options.caption,
      hashtags: options.hashtags,
      ocr_text: options.ocrText,
    },
  });

  return { result: data, unavailable };
}

export function isVybeCheckBlocked(result: VybeCheckResult): boolean {
  return result.status === 'rejected' || !result.allowed;
}

export function vybeCheckStatusLabel(status: VybeCheckResult['status']): string {
  switch (status) {
    case 'approved':
      return 'Approved';
    case 'limited':
      return 'Limited visibility';
    case 'needs_review':
      return 'Under review';
    case 'rejected':
      return 'Rejected';
    case 'pending_check':
      return 'Checking…';
    case 'appealed':
      return 'Appeal submitted';
    case 'removed':
      return 'Removed';
    default:
      return status;
  }
}
