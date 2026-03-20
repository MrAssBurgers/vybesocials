/**
 * NSFWJS Client-Side Content Scanner
 * 
 * Fully standalone - no external API dependencies.
 * Uses TensorFlow.js + NSFWJS model for image/video classification.
 * 
 * Categories: Porn, Sexy, Hentai, Drawing, Neutral
 */

import * as tf from '@tensorflow/tfjs';
import * as nsfwjs from 'nsfwjs';

let model: nsfwjs.NSFWJS | null = null;
let modelLoading: Promise<nsfwjs.NSFWJS> | null = null;

// Ensure TF.js doesn't consume all GPU memory
tf.env().set('WEBGL_DELETE_TEXTURE_THRESHOLD', 0);

/**
 * Lazy-load the NSFWJS model (cached after first load)
 */
async function getModel(): Promise<nsfwjs.NSFWJS> {
  if (model) return model;
  if (modelLoading) return modelLoading;
  
  modelLoading = nsfwjs.load().then((m) => {
    model = m;
    modelLoading = null;
    return m;
  });
  
  return modelLoading;
}

export interface ScanResult {
  result: 'allowed' | 'warned' | 'blocked';
  message: string;
  categories: string[];
  score: number;
  predictions?: nsfwjs.PredictionType[];
}

// Thresholds for classification
const BLOCK_THRESHOLD = 0.60; // Block if Porn/Hentai > 60%
const WARN_THRESHOLD = 0.40;  // Warn if Sexy > 40%

/**
 * Classify an image file for NSFW content
 */
export async function scanImage(file: File): Promise<ScanResult> {
  const nsfwModel = await getModel();
  
  // Create an image element from the file
  const img = await fileToImage(file);
  
  try {
    const predictions = await nsfwModel.classify(img);
    return interpretPredictions(predictions);
  } finally {
    // Clean up the image element
    img.remove();
  }
}

/**
 * Classify a video file by sampling frames
 */
export async function scanVideo(file: File): Promise<ScanResult> {
  const nsfwModel = await getModel();
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  
  const objectUrl = URL.createObjectURL(file);
  video.src = objectUrl;
  
  try {
    // Wait for video metadata
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error('Failed to load video'));
      video.load();
    });
    
    const duration = video.duration;
    const frameCount = Math.min(6, Math.max(3, Math.floor(duration / 2))); // 3-6 frames
    const interval = duration / (frameCount + 1);
    
    let worstResult: ScanResult = { result: 'allowed', message: 'Video passed safety checks.', categories: [], score: 0 };
    
    for (let i = 1; i <= frameCount; i++) {
      video.currentTime = interval * i;
      
      // Wait for seek to complete
      await new Promise<void>((resolve) => {
        video.onseeked = () => resolve();
      });
      
      // Classify the current frame
      const predictions = await nsfwModel.classify(video as any);
      const frameResult = interpretPredictions(predictions);
      
      // Keep the worst result
      if (frameResult.score > worstResult.score) {
        worstResult = frameResult;
      }
      
      // Early exit if blocked
      if (worstResult.result === 'blocked') break;
    }
    
    // Adjust message for video
    if (worstResult.result === 'blocked') {
      worstResult.message = 'This video contains content that violates community guidelines.';
    } else if (worstResult.result === 'warned') {
      worstResult.message = 'This video may contain sensitive content. Some viewers may find it inappropriate.';
    } else {
      worstResult.message = 'Video passed safety checks.';
    }
    
    return worstResult;
  } finally {
    URL.revokeObjectURL(objectUrl);
    video.remove();
  }
}

/**
 * Simple text safety check (keyword-based, no API needed)
 */
export function scanText(text: string): ScanResult {
  const lower = text.toLowerCase();
  
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
  
  return {
    result: 'allowed',
    message: '',
    categories: [],
    score: 0,
  };
}

/**
 * Interpret NSFWJS predictions into our safety system
 */
function interpretPredictions(predictions: nsfwjs.predictionType[]): ScanResult {
  const predMap: Record<string, number> = {};
  for (const p of predictions) {
    predMap[p.className] = p.probability;
  }
  
  const pornScore = predMap['Porn'] || 0;
  const hentaiScore = predMap['Hentai'] || 0;
  const sexyScore = predMap['Sexy'] || 0;
  const neutralScore = predMap['Neutral'] || 0;
  const drawingScore = predMap['Drawing'] || 0;
  
  const explicitScore = Math.max(pornScore, hentaiScore);
  const flaggedCategories: string[] = [];
  
  if (pornScore > BLOCK_THRESHOLD) flaggedCategories.push('explicit_content');
  if (hentaiScore > BLOCK_THRESHOLD) flaggedCategories.push('hentai');
  if (sexyScore > WARN_THRESHOLD) flaggedCategories.push('suggestive');
  
  // Blocked: high explicit content
  if (explicitScore >= BLOCK_THRESHOLD) {
    return {
      result: 'blocked',
      message: `This content cannot be posted because it contains ${flaggedCategories.join(', ') || 'explicit content'}.`,
      categories: flaggedCategories,
      score: explicitScore,
      predictions,
    };
  }
  
  // Warned: suggestive but not explicit
  if (sexyScore >= WARN_THRESHOLD && sexyScore > neutralScore) {
    return {
      result: 'warned',
      message: 'This content is allowed but may be considered sensitive by some viewers.',
      categories: flaggedCategories,
      score: sexyScore,
      predictions,
    };
  }
  
  // Allowed
  return {
    result: 'allowed',
    message: '',
    categories: [],
    score: Math.max(pornScore, hentaiScore, sexyScore * 0.5),
    predictions,
  };
}

/**
 * Convert a File to an HTMLImageElement
 */
function fileToImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

/**
 * Preload the model in the background (call on app init)
 */
export function preloadModel(): void {
  getModel().catch(console.error);
}
