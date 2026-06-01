/**
 * Centralized media optimization pipeline
 * - Client-side image compression (canvas-based)
 * - Auto thumbnail generation for videos
 * - WebP conversion when supported
 * - Adaptive quality based on file size
 */

import { withTimeout } from '@/lib/withTimeout';

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;     // 0-1
  format?: 'image/webp' | 'image/jpeg' | 'image/png';
  maxSizeMB?: number;   // Target max file size
}

const DEFAULT_POST_OPTIONS: CompressionOptions = {
  maxWidth: 1920,
  maxHeight: 1920,
  quality: 0.85,
  format: 'image/webp',
  maxSizeMB: 2,
};

const DEFAULT_AVATAR_OPTIONS: CompressionOptions = {
  maxWidth: 512,
  maxHeight: 512,
  quality: 0.8,
  format: 'image/webp',
  maxSizeMB: 0.5,
};

const DEFAULT_THUMBNAIL_OPTIONS: CompressionOptions = {
  maxWidth: 640,
  maxHeight: 640,
  quality: 0.7,
  format: 'image/webp',
  maxSizeMB: 0.3,
};

// Check WebP support
let webpSupported: boolean | null = null;
function supportsWebP(): boolean {
  if (webpSupported !== null) return webpSupported;
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  webpSupported = canvas.toDataURL('image/webp').startsWith('data:image/webp');
  return webpSupported;
}

/**
 * Compress an image file using canvas
 */
export async function compressImage(
  file: File,
  options: CompressionOptions = DEFAULT_POST_OPTIONS
): Promise<{ blob: Blob; width: number; height: number; savings: number }> {
  const {
    maxWidth = 1920,
    maxHeight = 1920,
    quality = 0.85,
    format: requestedFormat = 'image/webp',
    maxSizeMB = 2,
  } = options;

  // Use WebP if supported, fallback to JPEG
  const format = requestedFormat === 'image/webp' && !supportsWebP()
    ? 'image/jpeg'
    : requestedFormat;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      // Calculate dimensions maintaining aspect ratio
      let { width, height } = img;
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;

      // Use high-quality scaling
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      // Adaptive quality: if file is huge, compress more aggressively
      let adaptiveQuality = quality;
      const fileSizeMB = file.size / (1024 * 1024);
      if (fileSizeMB > maxSizeMB * 3) {
        adaptiveQuality = Math.max(0.5, quality - 0.2);
      } else if (fileSizeMB > maxSizeMB * 2) {
        adaptiveQuality = Math.max(0.6, quality - 0.1);
      }

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Compression failed'));
            return;
          }

          // If still too large, try lower quality
          if (blob.size > maxSizeMB * 1024 * 1024 && adaptiveQuality > 0.4) {
            canvas.toBlob(
              (retryBlob) => {
                const finalBlob = retryBlob || blob;
                resolve({
                  blob: finalBlob,
                  width,
                  height,
                  savings: Math.round((1 - finalBlob.size / file.size) * 100),
                });
              },
              format,
              adaptiveQuality - 0.2
            );
          } else {
            resolve({
              blob,
              width,
              height,
              savings: Math.round((1 - blob.size / file.size) * 100),
            });
          }
        },
        format,
        adaptiveQuality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

/**
 * Generate a thumbnail from a video file
 */
export async function generateVideoThumbnail(
  file: File,
  timeSeconds: number = 1
): Promise<Blob> {
  return withTimeout(
    new Promise<Blob>((resolve, reject) => {
      const video = document.createElement('video');
      const url = URL.createObjectURL(file);
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;

      const fail = (message: string) => {
        URL.revokeObjectURL(url);
        video.remove();
        reject(new Error(message));
      };

      video.onloadedmetadata = () => {
        video.currentTime = Math.min(timeSeconds, video.duration * 0.1);
      };

      video.onseeked = () => {
        const canvas = document.createElement('canvas');
        const { videoWidth: w, videoHeight: h } = video;
        const ratio = Math.min(640 / w, 640 / h, 1);
        canvas.width = Math.round(w * ratio);
        canvas.height = Math.round(h * ratio);

        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        URL.revokeObjectURL(url);
        video.remove();

        const format = supportsWebP() ? 'image/webp' : 'image/jpeg';
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Thumbnail generation failed'));
          },
          format,
          0.7
        );
      };

      video.onerror = () => fail('Failed to load video');

      video.src = url;
    }),
    12000,
    'Video thumbnail generation timed out'
  );
}

/**
 * Determine if a file needs compression
 */
export function needsCompression(file: File): boolean {
  // Skip small files (under 500KB)
  if (file.size < 500 * 1024) return false;
  // Only compress images
  return file.type.startsWith('image/');
}

/**
 * Determine if a file is a video
 */
export function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/');
}

/**
 * Get the appropriate file extension for compressed output
 */
export function getCompressedExtension(): string {
  return supportsWebP() ? 'webp' : 'jpg';
}

/**
 * Compress a file for post upload (images only, videos pass through)
 */
export async function optimizeForUpload(
  file: File,
  preset: 'post' | 'avatar' | 'thumbnail' = 'post'
): Promise<{ file: Blob; extension: string; savings: number }> {
  if (!needsCompression(file)) {
    return { file, extension: file.name.split('.').pop() || 'jpg', savings: 0 };
  }

  const options = preset === 'avatar'
    ? DEFAULT_AVATAR_OPTIONS
    : preset === 'thumbnail'
    ? DEFAULT_THUMBNAIL_OPTIONS
    : DEFAULT_POST_OPTIONS;

  const result = await compressImage(file, options);
  return {
    file: result.blob,
    extension: getCompressedExtension(),
    savings: result.savings,
  };
}
