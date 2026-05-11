/**
 * AI Safety Scan Client
 * 
 * Calls the ai-safety-scan edge function for second-pass moderation.
 * Handles image-to-base64 conversion and audio transcript submission.
 */

import { getFunctionAuthHeaders } from '@/lib/functionAuth';

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-safety-scan`;

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
  const headers = await getFunctionAuthHeaders();

  const response = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      image_base64: base64,
      mime_type: file.type || 'image/jpeg',
      scan_type: 'image',
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.error('[aiScanImage] failed:', response.status, body);
    if (response.status === 429) {
      return { allowed: true, result: 'allowed', categories: [], score: 0, message: 'Rate limited, skipping AI scan.' };
    }
    if (response.status === 402) {
      return { allowed: true, result: 'allowed', categories: [], score: 0, message: 'AI credits exhausted. Add funds in workspace settings.' };
    }
    return { allowed: true, result: 'allowed', categories: [], score: 0, message: `AI scan unavailable (${response.status}).` };
  }

  return response.json();
}

/**
 * Scan a video frame (as File/Blob) + optional audio transcript
 */
export async function aiScanVideoFrame(
  frameBlob: Blob,
  audioTranscript?: string
): Promise<AISafetyResult> {
  const base64 = await blobToBase64(frameBlob);
  const headers = await getFunctionAuthHeaders();

  const response = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      image_base64: base64,
      mime_type: 'image/jpeg',
      audio_transcript: audioTranscript,
      scan_type: audioTranscript ? 'both' : 'image',
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.error('[aiScanVideoFrame] failed:', response.status, body);
    if (response.status === 429) {
      return { allowed: true, result: 'allowed', categories: [], score: 0, message: 'Rate limited, skipping AI scan.' };
    }
    if (response.status === 402) {
      return { allowed: true, result: 'allowed', categories: [], score: 0, message: 'AI credits exhausted. Add funds in workspace settings.' };
    }
    return { allowed: true, result: 'allowed', categories: [], score: 0, message: `AI scan unavailable (${response.status}).` };
  }

  return response.json();
}

/**
 * Scan audio transcript only
 */
export async function aiScanAudioTranscript(transcript: string): Promise<AISafetyResult> {
  const headers = await getFunctionAuthHeaders();

  const response = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      audio_transcript: transcript,
      scan_type: 'audio',
    }),
  });

  if (!response.ok) {
    console.error('AI audio scan failed:', response.status);
    return { allowed: true, result: 'allowed', categories: [], score: 0, message: 'Audio scan unavailable.' };
  }

  return response.json();
}

/**
 * Extract a single frame from a video file as a JPEG blob
 */
export async function extractVideoFrame(file: File, timeSeconds: number = 1): Promise<Blob> {
  return new Promise((resolve, reject) => {
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
  });
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
      let timeoutId: ReturnType<typeof setTimeout>;

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

      // Timeout after 15 seconds max
      timeoutId = setTimeout(() => {
        recognition.stop();
      }, 15000);

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
