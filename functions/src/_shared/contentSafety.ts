import { scanImageSafeSearch } from './visionSafeSearch.js';
import { analyzeAudioWithGemini, analyzeImageWithGemini, analyzeTextWithGemini, AGE_RANK } from './safetyGemini.js';

export type SafetyOutcome = 'allowed' | 'warned' | 'blocked';

export interface VybeCheckScanRequest {
  image_base64?: string;
  mime_type?: string;
  audio_transcript?: string;
  scan_type?: 'image' | 'audio' | 'both';
  text?: string;
}

export interface VybeCheckScanResponse {
  allowed: boolean;
  result: SafetyOutcome;
  categories: string[];
  score: number;
  message: string;
  visual_analysis?: string;
  audio_analysis?: string;
  suggested_age_rating: 'safe' | '13+' | '18+';
  age_rating_reasons: string[];
  safe_search?: {
    adult: string;
    violence: string;
    racy: string;
  };
}

function finalize(score: number, categories: string[]): { result: SafetyOutcome; allowed: boolean; message: string } {
  const unique = [...new Set(categories)];
  if (score >= 0.7) {
    return {
      result: 'blocked',
      allowed: false,
      message: `This content was flagged for: ${unique.join(', ') || 'policy violation'}.`,
    };
  }
  if (score >= 0.4) {
    return {
      result: 'warned',
      allowed: true,
      message: 'This content may be sensitive. Viewer discretion advised.',
    };
  }
  return {
    result: 'allowed',
    allowed: true,
    message: 'Content passed Vybe Check.',
  };
}

/** Vybe Check: Vision Safe Search first, then Gemini for context / audio / text. */
export async function runVybeCheckScan(
  req: VybeCheckScanRequest,
  geminiApiKey?: string,
): Promise<VybeCheckScanResponse> {
  const results: VybeCheckScanResponse = {
    allowed: true,
    result: 'allowed',
    categories: [],
    score: 0,
    message: 'Content passed Vybe Check.',
    suggested_age_rating: 'safe',
    age_rating_reasons: [],
  };

  const scanType = req.scan_type || (req.image_base64 ? 'image' : req.audio_transcript ? 'audio' : 'image');
  const wantsImage = scanType === 'image' || scanType === 'both';
  const wantsAudio = scanType === 'audio' || scanType === 'both';

  if (wantsImage && req.image_base64) {
    if (req.image_base64.length > 6_000_000) {
      return {
        ...results,
        allowed: false,
        result: 'blocked',
        score: 1,
        categories: ['oversized_image'],
        message: 'Image is too large for safety scanning.',
      };
    }

    try {
      const vision = await scanImageSafeSearch(req.image_base64);
      results.safe_search = { adult: vision.adult, violence: vision.violence, racy: vision.racy };
      results.score = Math.max(results.score, vision.score);
      results.categories.push(...vision.categories);
      results.visual_analysis = vision.analysis;
      if (AGE_RANK[vision.suggestedAgeRating] > AGE_RANK[results.suggested_age_rating]) {
        results.suggested_age_rating = vision.suggestedAgeRating;
      }
      results.age_rating_reasons.push(...vision.ageRatingReasons);

      if (vision.blocked) {
        const fin = finalize(results.score, results.categories);
        return { ...results, ...fin };
      }
    } catch (err) {
      console.error('[VybeCheck] Vision Safe Search failed:', err);
      results.visual_analysis = 'Google Safe Search unavailable — using AI fallback.';
    }

    if (geminiApiKey) {
      try {
        const gemini = await analyzeImageWithGemini(
          geminiApiKey,
          req.image_base64,
          req.mime_type || 'image/jpeg',
        );
        if (gemini.score > results.score) {
          results.score = gemini.score;
          results.categories.push(...gemini.categories);
          results.visual_analysis = [results.visual_analysis, gemini.analysis].filter(Boolean).join(' ');
        }
        if (AGE_RANK[gemini.suggestedAge] > AGE_RANK[results.suggested_age_rating]) {
          results.suggested_age_rating = gemini.suggestedAge;
        }
        results.age_rating_reasons.push(...gemini.ageReasons);
      } catch (err) {
        console.error('[VybeCheck] Gemini image scan failed:', err);
      }
    }
  }

  const audioText = req.audio_transcript?.trim() || req.text?.trim();
  if ((wantsAudio && req.audio_transcript) || req.text) {
    if (geminiApiKey && audioText) {
      try {
        const gemini = req.audio_transcript
          ? await analyzeAudioWithGemini(geminiApiKey, req.audio_transcript)
          : await analyzeTextWithGemini(geminiApiKey, audioText);
        if (gemini.score > results.score) {
          results.score = gemini.score;
          results.categories.push(...gemini.categories);
        }
        if (req.audio_transcript) {
          results.audio_analysis = gemini.analysis;
        } else {
          results.visual_analysis = results.visual_analysis || gemini.analysis;
        }
        if (AGE_RANK[gemini.suggestedAge] > AGE_RANK[results.suggested_age_rating]) {
          results.suggested_age_rating = gemini.suggestedAge;
        }
        results.age_rating_reasons.push(...gemini.ageReasons);
      } catch (err) {
        console.error('[VybeCheck] Gemini text/audio scan failed:', err);
      }
    }
  }

  const fin = finalize(results.score, results.categories);
  return {
    ...results,
    categories: [...new Set(results.categories)],
    age_rating_reasons: [...new Set(results.age_rating_reasons)],
    ...fin,
  };
}
