/**
 * AI Content Detection Client
 * 
 * Sends images/video frames to the detect-ai-content edge function
 * to determine if content is AI-generated.
 */

import { db } from '@/lib/firebase';

interface AIDetectionResult {
  is_ai: boolean;
  confidence: number;
  reason: string;
}

/**
 * Detect if content is AI-generated (runs in background after post creation)
 */
export async function detectAIContent(
  postId: string,
  file?: File,
  caption?: string,
  guard: () => void = () => {},
): Promise<AIDetectionResult> {
  guard();
  try {
    let image_base64: string | undefined;
    let mime_type: string | undefined;

    if (file && file.type.startsWith('image/')) {
      image_base64 = await fileToBase64Resized(file, 512);
      guard();
      mime_type = file.type;
    } else if (file && file.type.startsWith('video/')) {
      // Extract a frame from the video for analysis
      const frameBlob = await extractVideoFrameForDetection(file);
      guard();
      if (frameBlob) {
        image_base64 = await blobToBase64(frameBlob);
        guard();
        mime_type = 'image/jpeg';
      }
    }

    if (!image_base64 && !caption) {
      return { is_ai: false, confidence: 0, reason: 'No content to analyze' };
    }

    guard();
    const { data, error } = await db.functions.invoke('detect-ai-content', {
      body: {
        image_base64,
        mime_type,
        caption,
        post_id: postId,
        content_type: file?.type.startsWith('video/') ? 'video' : 'image',
      },
    });
    guard();

    if (error) {
      console.warn('AI detection failed:', error);
      return { is_ai: false, confidence: 0, reason: 'Detection unavailable' };
    }

    return data as AIDetectionResult;
  } catch (err) {
    guard();
    console.warn('AI detection error:', err);
    return { is_ai: false, confidence: 0, reason: 'Detection failed' };
  }
}

/**
 * Extract a representative frame from a video for AI detection
 */
function extractVideoFrameForDetection(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(file);
    video.src = url;

    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.remove();
    };

    video.onloadeddata = () => {
      // Seek to 25% of the video for a representative frame
      video.currentTime = Math.min(2, video.duration * 0.25);
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        const maxSize = 512;
        const scale = Math.min(1, maxSize / Math.max(video.videoWidth, video.videoHeight));
        canvas.width = video.videoWidth * scale;
        canvas.height = video.videoHeight * scale;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            cleanup();
            canvas.remove();
            resolve(blob);
          },
          'image/jpeg',
          0.7
        );
      } catch {
        cleanup();
        resolve(null);
      }
    };

    video.onerror = () => {
      cleanup();
      resolve(null);
    };

    // Timeout after 10s
    setTimeout(() => {
      cleanup();
      resolve(null);
    }, 10000);

    video.load();
  });
}

function fileToBase64Resized(file: File, maxSize: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
      resolve(dataUrl.split(',')[1] || dataUrl);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

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
