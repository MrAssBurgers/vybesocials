/**
 * AI Safety Scan Client
 *
 * Calls Firebase aiSafetyScan (Vybe Check): Google Safe Search + Gemini.
 */

import { invokeEdgeFeature } from '@/lib/edgeFeature';

export interface AISafetyResult {
  allowed: boolean;
  result: 'allowed' | 'warned' | 'blocked';
  categories: string[];
  score: number;
  message: string;
  visual_analysis?: string;
  audio_analysis?: string;
  suggested_age_rating?: 'safe' | '13+' | '18+';
  age_rating_reasons?: string[];
}

/**
 * Scan an image file for violence, gore, weapons via AI
 */
export async function aiScanImage(file: File): Promise<AISafetyResult> {
  const base64 = await fileToBase64(file);
  const { data, unavailable } = await invokeEdgeFeature<Record<string, unknown>>('ai-safety-scan', {
    image_base64: base64,
    mime_type: file.type || 'image/jpeg',
    scan_type: 'image',
  });

  if (unavailable || !data) {
    return { allowed: true, result: 'allowed', categories: [], score: 0, message: 'AI scan unavailable.' };
  }

  return normalizeSafetyResult(data);
}

/**
 * Scan a video frame (as File/Blob) + optional audio transcript
 */
export async function aiScanVideoFrame(
  frameBlob: Blob,
  audioTranscript?: string
): Promise<AISafetyResult> {
  const base64 = await blobToBase64(frameBlob);
  const { data, unavailable } = await invokeEdgeFeature<Record<string, unknown>>('ai-safety-scan', {
    image_base64: base64,
    mime_type: 'image/jpeg',
    audio_transcript: audioTranscript,
    scan_type: audioTranscript ? 'both' : 'image',
  });

  if (unavailable || !data) {
    return { allowed: true, result: 'allowed', categories: [], score: 0, message: 'AI scan unavailable.' };
  }

  return normalizeSafetyResult(data);
}

/**
 * Scan audio transcript only
 */
export async function aiScanAudioTranscript(transcript: string): Promise<AISafetyResult> {
  const { data, unavailable } = await invokeEdgeFeature<Record<string, unknown>>('ai-safety-scan', {
    audio_transcript: transcript,
    scan_type: 'audio',
  });

  if (unavailable || !data) {
    return { allowed: true, result: 'allowed', categories: [], score: 0, message: 'Audio scan unavailable.' };
  }

  return normalizeSafetyResult(data);
}

/**
 * Extract a single frame from a video file as a JPEG blob
 */
export async function extractVideoFrame(file: File, timeSeconds: number = 1): Promise<Blob> {
  return withTimeout(
    new Promise<Blob>((resolve, reject) => {
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      const url = URL.createObjectURL(file);
      video.src = url;

      video.onloadedmetadata = () => {
        const seekTime = Math.min(timeSeconds, (video.duration || 2) * 0.3);
        video.currentTime = isFinite(seekTime) ? seekTime : 0;
      };

      video.onseeked = () => {
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(video.videoWidth, 512);
        canvas.height = Math.min(video.videoHeight, 512);
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(url);
            video.remove();
            canvas.remove();
            if (blob) resolve(blob);
            else reject(new Error('Failed to extract frame'));
          },
          'image/jpeg',
          0.7
        );
      };

      video.onerror = () => {
        URL.revokeObjectURL(url);
        video.remove();
        reject(new Error('Failed to load video'));
      };

      video.load();
    }),
    12000,
    'Video frame extraction timed out'
  );
}

/**
 * Transcribe audio from a video using Web Speech API (browser-native)
 */
export function transcribeVideoAudio(file: File): Promise<string> {
  return new Promise((resolve) => {
    // Check for Web Speech API support
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('Web Speech API not supported, skipping audio transcription');
      resolve('');
      return;
    }

    const audio = document.createElement('audio');
    const url = URL.createObjectURL(file);
    audio.src = url;

    // Use MediaStream approach for speech recognition
    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      
      let transcript = '';

      const timeoutId = setTimeout(() => {
        recognition.stop();
      }, 15000);

      recognition.onresult = (event: any) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            transcript += event.results[i][0].transcript + ' ';
          }
        }
      };

      recognition.onend = () => {
        clearTimeout(timeoutId);
        audio.pause();
        URL.revokeObjectURL(url);
        audio.remove();
        resolve(transcript.trim());
      };

      recognition.onerror = () => {
        clearTimeout(timeoutId);
        audio.pause();
        URL.revokeObjectURL(url);
        audio.remove();
        resolve(transcript.trim());
      };

      audio.play().then(() => {
        recognition.start();
      }).catch(() => {
        resolve('');
      });
    } catch {
      URL.revokeObjectURL(url);
      audio.remove();
      resolve('');
    }
  });
}

import { withTimeout } from '@/lib/withTimeout';

function normalizeSafetyResult(data: Record<string, unknown>): AISafetyResult {
  const explicitResult = data.result as AISafetyResult['result'] | undefined;
  if (explicitResult === 'blocked' || explicitResult === 'warned' || explicitResult === 'allowed') {
    return {
      allowed: explicitResult !== 'blocked',
      result: explicitResult,
      categories: Array.isArray(data.categories) ? (data.categories as string[]) : [],
      score: Number(data.score || 0),
      message: String(data.message || data.reason || ''),
      visual_analysis: data.visual_analysis as string | undefined,
      audio_analysis: data.audio_analysis as string | undefined,
      suggested_age_rating: data.suggested_age_rating as AISafetyResult['suggested_age_rating'],
      age_rating_reasons: data.age_rating_reasons as string[] | undefined,
    };
  }

  const safe = data.safe !== false && data.allowed !== false;
  return {
    allowed: safe,
    result: safe ? 'allowed' : 'blocked',
    categories: Array.isArray(data.categories) ? (data.categories as string[]) : [],
    score: Number(data.score || 0),
    message: String(data.reason || data.message || ''),
    visual_analysis: data.visual_analysis as string | undefined,
    audio_analysis: data.audio_analysis as string | undefined,
    suggested_age_rating: data.suggested_age_rating as AISafetyResult['suggested_age_rating'],
    age_rating_reasons: data.age_rating_reasons as string[] | undefined,
  };
}

// Helpers

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip data URI prefix
      const base64 = result.split(',')[1] || result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1] || result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
