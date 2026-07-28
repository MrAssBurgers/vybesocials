import { invokeEdgeFeature } from '@/lib/edgeFeature';
import { withTimeout } from '@/lib/withTimeout';
import { framesToPayload, extractVideoFrames } from './extractVideoFrames';
import type { VybeCheckResult } from './types';
import type { VybeFramePayload } from './fileToVybeFrames';

/** Background publish can run longer scans (video + STT). */
const VYBE_CHECK_TIMEOUT_MS = 180_000;
const FRAME_EXTRACT_TIMEOUT_MS = 120_000;

export type VybeCheckInvokeResult = VybeCheckResult;

export interface VybeCheckInvokeBody {
  content_type: string;
  content_id?: string;
  storage_path?: string;
  frames?: VybeFramePayload[];
  text?: {
    caption?: string;
    hashtags?: string[];
    ocr_text?: string;
    transcript?: string;
  };
}

export async function invokeVybeCheck(
  body: VybeCheckInvokeBody,
): Promise<{ result: VybeCheckResult | null; unavailable: boolean; errorMessage?: string }> {
  const { data, unavailable, errorMessage } = await withTimeout(
    invokeEdgeFeature<VybeCheckResult>('start-vybe-check', body as unknown as Record<string, unknown>),
    VYBE_CHECK_TIMEOUT_MS,
    'Vybe Check timed out',
  );
  return { result: data, unavailable, errorMessage };
}

export interface StartVybeCheckVideoOptions {
  file: File;
  storagePath: string;
  contentId?: string;
  caption?: string;
  hashtags?: string[];
  ocrText?: string;
  frames?: Awaited<ReturnType<typeof framesToPayload>>;
}

export async function startVybeCheckFrames(
  file: File,
  text?: { caption?: string; hashtags?: string[]; ocr_text?: string },
): Promise<{ result: VybeCheckResult | null; unavailable: boolean }> {
  const frames = await withTimeout(
    framesToPayload(await extractVideoFrames(file)),
    FRAME_EXTRACT_TIMEOUT_MS,
    'Video frame extraction timed out',
  );
  return invokeVybeCheck({ content_type: 'video', frames, text });
}

export async function startVybeCheckVideo(
  options: StartVybeCheckVideoOptions,
): Promise<{ result: VybeCheckResult | null; unavailable: boolean }> {
  const frames =
    options.frames ??
    (await withTimeout(
      framesToPayload(await extractVideoFrames(options.file)),
      FRAME_EXTRACT_TIMEOUT_MS,
      'Video frame extraction timed out',
    ));

  return invokeVybeCheck({
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
}

export function isVybeCheckBlocked(result: VybeCheckResult): boolean {
  return result.status === 'rejected' || !result.allowed;
}

/** Block publish until human review completes. */
export function isVybeCheckReviewBlocked(result: VybeCheckResult): boolean {
  return result.status === 'needs_review' || result.requires_review === true;
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
