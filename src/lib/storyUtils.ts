/**
 * Utility functions for story media handling
 */

export type StoryMediaKind = 'image' | 'video';

/** Android gallery picks often omit file.type — infer from MIME or extension. */
export function inferStoryMediaKind(file: File): StoryMediaKind | null {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'].includes(ext)) return 'image';
  if (['mp4', 'mov', 'webm', 'mkv', '3gp', '3gpp', 'm4v'].includes(ext)) return 'video';
  return null;
}

export function storyUploadContentType(file: File | Blob, kind: StoryMediaKind): string {
  if (file instanceof File && file.type) return file.type;
  return kind === 'video' ? 'video/mp4' : 'image/jpeg';
}

export interface MediaValidationResult {
  valid: boolean;
  error?: string;
  aspectRatio?: number;
  duration?: number | null;
  needsCrop?: boolean;
}

// Validate story media file
export async function validateStoryMedia(file: File): Promise<MediaValidationResult> {
  const maxSize = 50 * 1024 * 1024; // 50MB
  const maxVideoDuration = 60; // 60 seconds max
  const targetAspectRatio = 9 / 16; // 0.5625
  const aspectRatioTolerance = 0.15; // 15% tolerance
  
  // Check file size
  if (file.size > maxSize) {
    return { valid: false, error: 'File size must be less than 50MB' };
  }

  // Validate file type (Android gallery may omit MIME type)
  const mediaKind = inferStoryMediaKind(file);
  if (!mediaKind) {
    return { valid: false, error: 'Please select an image or video' };
  }
  const isImage = mediaKind === 'image';
  const isVideo = mediaKind === 'video';

  try {
    if (isImage) {
      return await validateImage(file, targetAspectRatio, aspectRatioTolerance);
    } else {
      return await validateVideo(file, targetAspectRatio, aspectRatioTolerance, maxVideoDuration);
    }
  } catch (err) {
    console.error('Media validation error:', err);
    return { valid: false, error: 'Failed to validate media' };
  }
}

async function validateImage(
  file: File, 
  targetAspectRatio: number, 
  tolerance: number
): Promise<MediaValidationResult> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    let settled = false;
    const finish = (result: MediaValidationResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve(result);
    };
    const timer = setTimeout(() => {
      finish({ valid: false, error: 'Image took too long to load — try JPG or PNG' });
    }, 15000);
    
    img.onload = () => {
      const aspectRatio = img.width / img.height;
      const needsCrop = Math.abs(aspectRatio - targetAspectRatio) > tolerance;
      finish({ valid: true, aspectRatio, duration: null, needsCrop });
    };
    
    img.onerror = () => {
      finish({ valid: false, error: 'Failed to load image' });
    };
    
    img.src = url;
  });
}

async function validateVideo(
  file: File, 
  targetAspectRatio: number, 
  tolerance: number,
  maxDuration: number
): Promise<MediaValidationResult> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    const url = URL.createObjectURL(file);
    let settled = false;
    const finish = (result: MediaValidationResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve(result);
    };
    const timer = setTimeout(() => {
      finish({ valid: false, error: 'Video took too long to load — try MP4 or MOV' });
    }, 20000);
    
    video.onloadedmetadata = () => {
      const duration = video.duration;
      if (!Number.isFinite(duration) || duration <= 0) {
        finish({ valid: false, error: 'Could not read video duration' });
        return;
      }
      if (duration > maxDuration) {
        finish({ valid: false, error: `Video must be ${maxDuration} seconds or less` });
        return;
      }
      
      const aspectRatio = video.videoWidth / video.videoHeight;
      const needsCrop = Math.abs(aspectRatio - targetAspectRatio) > tolerance;
      
      finish({
        valid: true,
        aspectRatio,
        duration: Math.round(duration),
        needsCrop,
      });
    };
    
    video.onerror = () => {
      finish({ valid: false, error: 'Failed to load video' });
    };
    
    video.src = url;
  });
}

// Compress image using canvas
export async function compressImage(
  file: File, 
  maxWidth: number = 1080,
  quality: number = 0.85
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      
      // Calculate new dimensions
      let width = img.width;
      let height = img.height;
      
      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }
      
      // Create canvas
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      
      ctx.drawImage(img, 0, 0, width, height);
      
      // Convert to blob
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to compress image'));
          }
        },
        'image/jpeg',
        quality
      );
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for compression'));
    };
    
    img.src = url;
  });
}

// Generate a unique filename for storage
export function generateStoryFileName(userId: string, fileType: string): string {
  const ext = fileType === 'video' ? 'mp4' : 'jpg';
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${userId}/${timestamp}-${random}.${ext}`;
}

export function generateStoryThumbnailFileName(userId: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${userId}/${timestamp}-${random}-thumb.jpg`;
}

/** Auto-generate a poster thumbnail from story media. */
export async function generateStoryThumbnail(
  file: File,
  isVideo: boolean,
  seekTime = 0.5,
): Promise<Blob> {
  if (isVideo) {
    return captureVideoFrame(file, seekTime);
  }
  return compressImage(file, 360, 0.82);
}

async function captureVideoFrame(file: File, seekTime: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    const url = URL.createObjectURL(file);
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const timer = setTimeout(() => {
      URL.revokeObjectURL(url);
      reject(new Error('Cover preview timed out — you can still share without waiting'));
    }, 15000);

    const cleanup = () => URL.revokeObjectURL(url);

    video.onloadedmetadata = () => {
      const target = Math.min(
        Math.max(seekTime, 0),
        Number.isFinite(video.duration) ? Math.max(video.duration - 0.05, 0) : seekTime,
      );
      video.currentTime = target;
    };

    video.onseeked = () => {
      const maxWidth = 360;
      let width = video.videoWidth;
      let height = video.videoHeight;

      if (!width || !height) {
        finish(() => {
          cleanup();
          reject(new Error('Invalid video dimensions'));
        });
        return;
      }

      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        finish(() => {
          cleanup();
          reject(new Error('Failed to get canvas context'));
        });
        return;
      }

      ctx.drawImage(video, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          finish(() => {
            cleanup();
            if (blob) resolve(blob);
            else reject(new Error('Failed to capture video frame'));
          });
        },
        'image/jpeg',
        0.82,
      );
    };

    video.onerror = () => {
      finish(() => {
        cleanup();
        reject(new Error('Failed to load video for thumbnail'));
      });
    };

    video.src = url;
  });
}

/** Resolve the best poster URL for a story tile. */
export function getStoryPosterUrl(story: {
  thumbnail_url?: string | null;
  media_url: string;
  media_type: string;
}): string | null {
  if (story.thumbnail_url) return story.thumbnail_url;
  if (story.media_type === 'image') return story.media_url;
  return null;
}

/** Scale poster tiles to home grid widget size (colSpan × rowSpan). */
export function computeStoryPosterDimensions(
  colSpan: 1 | 2 = 2,
  rowSpan: 1 | 2 = 1,
  containerWidth?: number,
  containerHeight?: number,
): { width: number; height: number; borderRadius: number } {
  const aspect = 84 / 112; // width / height (portrait poster)

  let width = colSpan === 2 ? 96 : 80;
  if (rowSpan === 2) width += 16;

  if (containerWidth) {
    const inner = Math.max(0, containerWidth - 24);
    if (colSpan === 2) {
      width = Math.min(128, Math.max(88, Math.round(inner / 3.2)));
    } else {
      width = Math.min(112, Math.max(72, Math.round(inner * 0.85)));
    }
  }

  let height = Math.round(width / aspect);

  // Tall grid cells — grow poster to use available height
  if (containerHeight && containerHeight > height + 40) {
    const maxH = Math.min(containerHeight - 36, 240);
    if (maxH > height) {
      height = maxH;
      width = Math.round(height * aspect);
      if (containerWidth) {
        const maxW = containerWidth - 16;
        if (width > maxW) {
          width = maxW;
          height = Math.round(width / aspect);
        }
      }
    }
  }

  const borderRadius = Math.max(14, Math.round(width * 0.2));
  return { width, height, borderRadius };
}
