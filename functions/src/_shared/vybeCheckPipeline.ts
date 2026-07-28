import { scanImageSafeSearch } from './visionSafeSearch.js';
import { analyzeImageWithGemini, analyzeTextWithGemini } from './safetyGemini.js';
import { moderateVybeCheckText } from './openaiModeration.js';
import type {
  VybeCheckFrameInput,
  VybeCheckRecord,
  VybeCheckResult,
  VybeCheckStatus,
  VybeCheckTextInput,
} from './vybeCheckTypes.js';

const BORDERLINE_LOW = 0.4;
const BORDERLINE_HIGH = 0.7;
const REVIEW_THRESHOLD = 0.55;

export function decideVybeCheckStatus(score: number, hardBlock: boolean): VybeCheckStatus {
  if (hardBlock || score >= BORDERLINE_HIGH) return 'rejected';
  if (score >= REVIEW_THRESHOLD) return 'needs_review';
  if (score >= BORDERLINE_LOW) return 'limited';
  return 'approved';
}

function toResult(
  checkId: string,
  status: VybeCheckStatus,
  score: number,
  categories: string[],
  message: string,
  transcript?: string,
): VybeCheckResult {
  return {
    check_id: checkId,
    status,
    score,
    categories: [...new Set(categories)],
    message,
    allowed: status === 'approved' || status === 'limited',
    requires_review: status === 'needs_review',
    limited: status === 'limited',
    transcript,
  };
}

export async function runVybeCheckPipeline(opts: {
  checkId: string;
  userId: string;
  contentType: string;
  contentId?: string;
  storagePath?: string;
  frames: VybeCheckFrameInput[];
  text: VybeCheckTextInput;
  transcript?: string;
  geminiApiKey?: string;
  openaiApiKey?: string;
}): Promise<{ record: Omit<VybeCheckRecord, 'created_at' | 'updated_at'>; result: VybeCheckResult }> {
  const categories: string[] = [];
  let score = 0;
  let hardBlock = false;
  let worstAdult = 'UNKNOWN';
  let worstViolence = 'UNKNOWN';
  let worstRacy = 'UNKNOWN';
  let blockedFrame: number | undefined;
  let visualAnalysis = '';

  const framesToScan = opts.frames.slice(0, 60);
  for (let i = 0; i < framesToScan.length; i++) {
    const frame = framesToScan[i];
    if (!frame.base64) continue;
    try {
      const vision = await scanImageSafeSearch(frame.base64);
      if (vision.score > score) score = vision.score;
      categories.push(...vision.categories);
      if (vision.adult > worstAdult || scoreLikelihoodRank(vision.adult) > scoreLikelihoodRank(worstAdult)) {
        worstAdult = vision.adult;
      }
      if (scoreLikelihoodRank(vision.violence) > scoreLikelihoodRank(worstViolence)) {
        worstViolence = vision.violence;
      }
      if (scoreLikelihoodRank(vision.racy) > scoreLikelihoodRank(worstRacy)) {
        worstRacy = vision.racy;
      }
      if (vision.blocked) {
        hardBlock = true;
        blockedFrame = frame.timestamp_sec ?? i;
        visualAnalysis = vision.analysis;
        break;
      }
    } catch (err) {
      console.error(`[VybeCheck] SafeSearch frame ${i} failed:`, err);
    }
  }

  let moderation: VybeCheckRecord['moderation'];
  const textInput: VybeCheckTextInput = {
    ...opts.text,
    transcript: opts.transcript || opts.text.transcript,
  };

  if (opts.openaiApiKey) {
    try {
      const mod = await moderateVybeCheckText(opts.openaiApiKey, textInput);
      moderation = {
        flagged: mod.flagged,
        score: mod.score,
        categories: mod.categories,
      };
      if (mod.score > score) score = mod.score;
      categories.push(...mod.categories);
      if (mod.flagged && mod.score >= BORDERLINE_HIGH) hardBlock = true;
    } catch (err) {
      console.error('[VybeCheck] OpenAI moderation failed:', err);
    }
  }

  let geminiReview: VybeCheckRecord['gemini_review'];
  const worstFrame = framesToScan.find((f) => f.base64);
  const captionText = [textInput.caption, ...(textInput.hashtags || []), textInput.ocr_text]
    .filter(Boolean)
    .join(' ')
    .trim();

  // Gemini text — captions, hashtags, transcripts (always when key present).
  if (opts.geminiApiKey && captionText) {
    try {
      const geminiText = await analyzeTextWithGemini(opts.geminiApiKey, captionText);
      if (geminiText.score > score) score = geminiText.score;
      categories.push(...geminiText.categories);
      if (geminiText.score >= BORDERLINE_HIGH) hardBlock = true;
      geminiReview = {
        score: geminiText.score,
        analysis: geminiText.analysis,
      };
    } catch (err) {
      console.error('[VybeCheck] Gemini text review failed:', err);
    }
  }

  // Gemini vision — all image/post/video frames (not only borderline).
  const runGeminiVision =
    Boolean(opts.geminiApiKey && worstFrame?.base64) &&
    (framesToScan.length > 0 || opts.contentType === 'post' || opts.contentType === 'image');

  if (runGeminiVision && worstFrame?.base64) {
    try {
      const gemini = await analyzeImageWithGemini(
        opts.geminiApiKey!,
        worstFrame.base64,
        worstFrame.mime_type || 'image/jpeg',
      );
      geminiReview = {
        score: Math.max(geminiReview?.score ?? 0, gemini.score),
        analysis: [geminiReview?.analysis, gemini.analysis].filter(Boolean).join(' '),
      };
      if (gemini.score > score) score = gemini.score;
      categories.push(...gemini.categories);
      visualAnalysis = [visualAnalysis, gemini.analysis].filter(Boolean).join(' ');
      if (gemini.score >= BORDERLINE_HIGH) hardBlock = true;
    } catch (err) {
      console.error('[VybeCheck] Gemini vision review failed:', err);
    }
  }

  const status = decideVybeCheckStatus(score, hardBlock);
  const message =
    status === 'rejected'
      ? `Vybe Check rejected: ${[...new Set(categories)].slice(0, 5).join(', ') || 'policy violation'}`
      : status === 'needs_review'
        ? 'Vybe Check: queued for human review.'
        : status === 'limited'
          ? 'Vybe Check: limited visibility — sensitive content.'
          : 'Vybe Check passed.';

  const now = new Date().toISOString();
  const record: Omit<VybeCheckRecord, 'created_at' | 'updated_at'> & {
    created_at: string;
    updated_at: string;
  } = {
    user_id: opts.userId,
    content_type: opts.contentType,
    // Firestore rejects undefined — text-only publishes omit content_id / storage_path.
    content_id: opts.contentId ?? null,
    storage_path: opts.storagePath ?? null,
    status,
    score,
    categories: [...new Set(categories)],
    message,
    frame_count: opts.frames.length,
    frames_scanned: framesToScan.length,
    safe_search: {
      worst_adult: worstAdult,
      worst_violence: worstViolence,
      worst_racy: worstRacy,
      // Firestore rejects undefined values, including nested optional fields.
      blocked_frame: blockedFrame ?? null,
    },
    moderation: moderation ?? null,
    gemini_review: geminiReview ?? null,
    transcript: opts.transcript || opts.text.transcript || null,
    created_at: now,
    updated_at: now,
  };

  return {
    record,
    result: toResult(
      opts.checkId,
      status,
      score,
      record.categories,
      message,
      record.transcript || undefined,
    ),
  };
}

function scoreLikelihoodRank(value: string): number {
  const order = ['UNKNOWN', 'VERY_UNLIKELY', 'UNLIKELY', 'POSSIBLE', 'LIKELY', 'VERY_LIKELY'];
  return order.indexOf(value);
}
