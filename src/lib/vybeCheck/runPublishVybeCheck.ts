/**
 * Canonical Vybe Check for publish paths — NSFWJS pre-filter + server pipeline
 * (Google SafeSearch + OpenAI moderation + Gemini 2.5 Flash).
 */
import { containsBlockedContent } from '@/lib/contentModeration';
import { shouldBypassSafety } from '@/lib/ownerBypass';
import { scanImage as nsfwScanImage, scanVideo as nsfwScanVideo } from '@/lib/nsfwScanner';
import { withTimeout } from '@/lib/withTimeout';
import { fileToVybeFrames } from './fileToVybeFrames';
import {
  invokeVybeCheck,
  isVybeCheckBlocked,
  isVybeCheckReviewBlocked,
  type VybeCheckInvokeResult,
} from './vybeCheckClient';

export type PublishAgeRating = 'safe' | '13+' | '18+';

export interface PublishVybeCheckInput {
  caption: string;
  tags?: string[];
  mediaFile?: File;
  mediaFiles?: File[];
  contentType?: 'post' | 'short' | 'video' | 'text' | 'story';
}

export interface PublishVybeCheckResult {
  allowed: boolean;
  message: string;
  categories: string[];
  ageRating: PublishAgeRating;
  checkId?: string;
  blocked: boolean;
}

const CHECK_TIMEOUT_MS = 60_000;

function ageFromStatus(status: VybeCheckInvokeResult['status']): PublishAgeRating {
  if (status === 'limited') return '13+';
  return 'safe';
}

function mergeWorst(
  current: PublishVybeCheckResult | null,
  next: PublishVybeCheckResult,
): PublishVybeCheckResult {
  if (!current) return next;
  if (next.blocked) return next;
  if (current.blocked) return current;
  return {
    allowed: next.allowed && current.allowed,
    blocked: false,
    message: next.message || current.message,
    categories: [...new Set([...current.categories, ...next.categories])],
    ageRating:
      next.ageRating === '18+' || current.ageRating === '18+'
        ? '18+'
        : next.ageRating === '13+' || current.ageRating === '13+'
          ? '13+'
          : 'safe',
    checkId: next.checkId || current.checkId,
  };
}

function resultFromVybe(
  vybe: VybeCheckInvokeResult,
  unavailable: boolean,
): PublishVybeCheckResult {
  if (unavailable) {
    return {
      allowed: false,
      blocked: true,
      // Transport/provider details (for example a missing callable's 404) are
      // not a content decision or evidence that signing out would help.
      message: 'Vybe Check is unavailable right now. Your content has not been published. Please try again later.',
      categories: ['vybe_check_unavailable'],
      ageRating: 'safe',
    };
  }
  if (isVybeCheckBlocked(vybe) || isVybeCheckReviewBlocked(vybe)) {
    return {
      allowed: false,
      blocked: true,
      message: vybe.message || 'Publishing failed — content violates community guidelines.',
      categories: vybe.categories || [],
      ageRating: 'safe',
      checkId: vybe.check_id,
    };
  }
  return {
    allowed: true,
    blocked: false,
    message: vybe.message || 'Vybe Check passed.',
    categories: vybe.categories || [],
    ageRating: ageFromStatus(vybe.status),
    checkId: vybe.check_id,
  };
}

async function checkSingleFile(
  file: File,
  text: { caption?: string; hashtags?: string[] },
  contentType: string,
): Promise<PublishVybeCheckResult> {
  const isVideo = file.type.startsWith('video/');
  const nsfw = await withTimeout(
    isVideo ? nsfwScanVideo(file) : nsfwScanImage(file),
    90_000,
    'Vybe Check pre-scan timed out.',
  );
  if (nsfw.result === 'blocked') {
    return {
      allowed: false,
      blocked: true,
      message: nsfw.message || 'Content violates community guidelines.',
      categories: nsfw.categories || [],
      ageRating: 'safe',
    };
  }

  const frames = await withTimeout(
    fileToVybeFrames(file),
    120_000,
    'Vybe Check frame prep timed out.',
  );

  const { result, unavailable } = await withTimeout(
    invokeVybeCheck({
      content_type: isVideo ? 'video' : 'post',
      frames,
      text,
    }),
    CHECK_TIMEOUT_MS,
    'Vybe Check timed out. Try again on a stronger connection.',
  );

  if (!result) {
    return resultFromVybe({} as VybeCheckInvokeResult, true);
  }
  return resultFromVybe(result, unavailable);
}

/** Run full Vybe Check before any publish/upload. Fail-closed when server unavailable. */
export async function runPublishVybeCheck(
  input: PublishVybeCheckInput,
): Promise<PublishVybeCheckResult> {
  const caption = input.caption?.trim() || '';
  const tags = input.tags || [];
  const text = { caption, hashtags: tags };
  const contentType = input.contentType || 'post';

  if (await shouldBypassSafety()) {
    return {
      allowed: true,
      blocked: false,
      message: 'Owner bypass',
      categories: [],
      ageRating: 'safe',
    };
  }

  const local = containsBlockedContent(caption);
  if (local.blocked) {
    return {
      allowed: false,
      blocked: true,
      message: 'Your caption contains inappropriate content.',
      categories: ['caption'],
      ageRating: 'safe',
    };
  }

  const files = input.mediaFiles?.length
    ? input.mediaFiles
    : input.mediaFile
      ? [input.mediaFile]
      : [];

  if (!files.length) {
    const { result, unavailable } = await withTimeout(
      invokeVybeCheck({ content_type: 'text', text }),
      CHECK_TIMEOUT_MS,
      'Vybe Check timed out.',
    );
    if (!result) return resultFromVybe({} as VybeCheckInvokeResult, true);
    return resultFromVybe(result, unavailable);
  }

  let merged: PublishVybeCheckResult | null = null;
  for (const file of files) {
    const row = await checkSingleFile(file, text, contentType);
    merged = mergeWorst(merged, row);
    if (merged.blocked) return merged;
  }

  return merged!;
}
