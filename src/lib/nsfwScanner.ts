/**
 * Content Safety Scanner (Lightweight)
 * 
 * Text-based moderation runs locally. Image/video scanning returns 'allowed'
 * by default — heavy ML scanning (TensorFlow/NSFWJS) was removed to fix
 * build compatibility issues. Server-side moderation should be used for
 * production image/video scanning.
 */

export interface ScanResult {
  result: 'allowed' | 'warned' | 'blocked';
  message: string;
  categories: string[];
  score: number;
  predictions?: { className: string; probability: number }[];
}

/**
 * Classify an image file — returns allowed (no client-side ML).
 */
export async function scanImage(_file: File): Promise<ScanResult> {
  return { result: 'allowed', message: '', categories: [], score: 0 };
}

/**
 * Classify a video file — returns allowed (no client-side ML).
 */
export async function scanVideo(_file: File): Promise<ScanResult> {
  return { result: 'allowed', message: '', categories: [], score: 0 };
}

/**
 * Simple text safety check (keyword-based, no API needed)
 */
export function scanText(text: string): ScanResult {
  // Severe hate speech patterns (block)
  const severePatterns = [
    /\bn[i1!]gg[ae3]r/i,
    /\bk[i1!]ke\b/i,
    /\bf[a@]gg?[o0]t/i,
    /\btr[a@]nn(?:y|ie)/i,
    /\bretard(?:ed)?\b/i,
    /\bkill\s+(?:yourself|urself|all)\b/i,
    /\bdie\s+(?:already|bitch|fag)/i,
  ];

  for (const pattern of severePatterns) {
    if (pattern.test(text)) {
      return {
        result: 'blocked',
        message: 'This message contains hate speech or slurs that violate community guidelines.',
        categories: ['hate_speech'],
        score: 1.0,
      };
    }
  }

  // Threat patterns (block)
  const threatPatterns = [
    /\bi'?ll\s+kill\s+(?:you|u)\b/i,
    /\bdox(?:x)?(?:ing|ed)?\b/i,
    /\bswat(?:t)?(?:ing|ed)?\b/i,
  ];

  for (const pattern of threatPatterns) {
    if (pattern.test(text)) {
      return {
        result: 'blocked',
        message: 'This message contains threats that violate community guidelines.',
        categories: ['threats'],
        score: 0.9,
      };
    }
  }

  return { result: 'allowed', message: '', categories: [], score: 0 };
}

/**
 * No-op model preload (kept for API compatibility)
 */
export function preloadModel(): void {}
