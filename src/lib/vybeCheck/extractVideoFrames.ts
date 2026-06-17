import type { ExtractedFrame } from './types';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] || result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function captureFrame(video: HTMLVideoElement, width: number, height: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Canvas unavailable'));
  ctx.drawImage(video, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Frame capture failed'))),
      'image/jpeg',
      0.72,
    );
  });
}

function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      resolve();
    };
    const onError = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      reject(new Error('Video seek failed'));
    };
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    video.currentTime = time;
  });
}

/**
 * Extract JPEG frames for Vybe Check.
 * Short clips (≤15s): every 0.5s. Longer: 1 frame per second. Max 60 frames.
 */
export async function extractVideoFrames(
  file: File,
  maxFrames = 60,
): Promise<ExtractedFrame[]> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.src = url;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Failed to load video'));
    });

    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 3;
    const intervalSec = duration <= 15 ? 0.5 : 1;
    const width = Math.min(video.videoWidth || 512, 512);
    const height = Math.min(video.videoHeight || 512, 512);

    const frames: ExtractedFrame[] = [];
    for (let t = 0; t < duration && frames.length < maxFrames; t += intervalSec) {
      await seekVideo(video, Math.min(t, Math.max(0, duration - 0.05)));
      const blob = await captureFrame(video, width, height);
      frames.push({ blob, timestampSec: Math.round(t * 10) / 10 });
    }

    return frames;
  } finally {
    URL.revokeObjectURL(url);
    video.remove();
  }
}

export async function framesToPayload(frames: ExtractedFrame[]) {
  return Promise.all(
    frames.map(async (frame) => ({
      base64: await blobToBase64(frame.blob),
      mime_type: 'image/jpeg',
      timestamp_sec: frame.timestampSec,
    })),
  );
}
