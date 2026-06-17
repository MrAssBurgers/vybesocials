import vision from '@google-cloud/vision';

export type Likelihood =
  | 'UNKNOWN'
  | 'VERY_UNLIKELY'
  | 'UNLIKELY'
  | 'POSSIBLE'
  | 'LIKELY'
  | 'VERY_LIKELY';

const LIKELIHOOD_SCORE: Record<Likelihood, number> = {
  UNKNOWN: 0,
  VERY_UNLIKELY: 0.05,
  UNLIKELY: 0.15,
  POSSIBLE: 0.45,
  LIKELY: 0.75,
  VERY_LIKELY: 0.95,
};

export interface VisionSafeSearchResult {
  adult: Likelihood;
  violence: Likelihood;
  racy: Likelihood;
  medical: Likelihood;
  spoof: Likelihood;
  score: number;
  categories: string[];
  blocked: boolean;
  warned: boolean;
  analysis: string;
  suggestedAgeRating: 'safe' | '13+' | '18+';
  ageRatingReasons: string[];
}

let client: vision.ImageAnnotatorClient | null = null;

function getClient(): vision.ImageAnnotatorClient {
  if (!client) client = new vision.ImageAnnotatorClient();
  return client;
}

function scoreLikelihood(value: string | null | undefined): number {
  const key = (value || 'UNKNOWN') as Likelihood;
  return LIKELIHOOD_SCORE[key] ?? 0;
}

function asLikelihood(value: string | null | undefined): Likelihood {
  const key = (value || 'UNKNOWN') as Likelihood;
  return key in LIKELIHOOD_SCORE ? key : 'UNKNOWN';
}

/** Google Cloud Vision Safe Search — first pass for Vybe Check image uploads. */
export async function scanImageSafeSearch(imageBase64: string): Promise<VisionSafeSearchResult> {
  const [result] = await getClient().safeSearchDetection({
    image: { content: Buffer.from(imageBase64, 'base64') },
  });

  const ann = result.safeSearchAnnotation;
  const adult = asLikelihood(ann?.adult != null ? String(ann.adult) : undefined);
  const violence = asLikelihood(ann?.violence != null ? String(ann.violence) : undefined);
  const racy = asLikelihood(ann?.racy != null ? String(ann.racy) : undefined);
  const medical = asLikelihood(ann?.medical != null ? String(ann.medical) : undefined);
  const spoof = asLikelihood(ann?.spoof != null ? String(ann.spoof) : undefined);

  const adultScore = scoreLikelihood(adult);
  const violenceScore = scoreLikelihood(violence);
  const racyScore = scoreLikelihood(racy);

  const categories: string[] = [];
  const ageRatingReasons: string[] = [];
  let score = Math.max(adultScore, violenceScore, racyScore);
  let suggestedAgeRating: 'safe' | '13+' | '18+' = 'safe';
  let blocked = false;
  let warned = false;
  let analysis = 'Google Safe Search: no issues detected.';

  if (adult === 'VERY_LIKELY' || violence === 'VERY_LIKELY') {
    blocked = true;
    score = Math.max(score, 0.95);
    if (adult === 'VERY_LIKELY') categories.push('adult', 'nudity');
    if (violence === 'VERY_LIKELY') categories.push('violence');
    suggestedAgeRating = '18+';
    ageRatingReasons.push('Google Safe Search flagged explicit or violent content');
    analysis = `Google Safe Search blocked (adult=${adult}, violence=${violence}).`;
  } else if (adult === 'LIKELY' || violence === 'LIKELY') {
    warned = true;
    score = Math.max(score, 0.65);
    if (adult === 'LIKELY') {
      categories.push('adult');
      suggestedAgeRating = '18+';
      ageRatingReasons.push('Likely adult content');
    }
    if (violence === 'LIKELY') {
      categories.push('violence');
      if (suggestedAgeRating === 'safe') suggestedAgeRating = '13+';
      ageRatingReasons.push('Likely violent content');
    }
    analysis = `Google Safe Search warning (adult=${adult}, violence=${violence}).`;
  } else if (racy === 'VERY_LIKELY' || racy === 'LIKELY') {
    warned = true;
    score = Math.max(score, racy === 'VERY_LIKELY' ? 0.55 : 0.45);
    categories.push('racy');
    if (suggestedAgeRating === 'safe') suggestedAgeRating = '13+';
    ageRatingReasons.push('Suggestive content detected');
    analysis = `Google Safe Search: suggestive content (racy=${racy}).`;
  } else if (adult === 'POSSIBLE' || violence === 'POSSIBLE' || racy === 'POSSIBLE') {
    score = Math.max(score, 0.35);
    analysis = `Google Safe Search: borderline (adult=${adult}, violence=${violence}, racy=${racy}).`;
  }

  if (medical === 'LIKELY' || medical === 'VERY_LIKELY') {
    categories.push('medical');
    if (suggestedAgeRating === 'safe') suggestedAgeRating = '13+';
    ageRatingReasons.push('Medical imagery detected');
  }

  return {
    adult,
    violence,
    racy,
    medical,
    spoof,
    score,
    categories: [...new Set(categories)],
    blocked,
    warned,
    analysis,
    suggestedAgeRating,
    ageRatingReasons,
  };
}
