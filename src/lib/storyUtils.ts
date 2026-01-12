/**
 * Utility functions for story media handling
 */

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

  // Validate file type
  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');
  
  if (!isImage && !isVideo) {
    return { valid: false, error: 'Please select an image or video' };
  }

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
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      const aspectRatio = img.width / img.height;
      const needsCrop = Math.abs(aspectRatio - targetAspectRatio) > tolerance;
      
      resolve({
        valid: true,
        aspectRatio,
        duration: null,
        needsCrop,
      });
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ valid: false, error: 'Failed to load image' });
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
    const url = URL.createObjectURL(file);
    
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      
      const duration = video.duration;
      if (duration > maxDuration) {
        resolve({ 
          valid: false, 
          error: `Video must be ${maxDuration} seconds or less` 
        });
        return;
      }
      
      const aspectRatio = video.videoWidth / video.videoHeight;
      const needsCrop = Math.abs(aspectRatio - targetAspectRatio) > tolerance;
      
      resolve({
        valid: true,
        aspectRatio,
        duration: Math.round(duration),
        needsCrop,
      });
    };
    
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ valid: false, error: 'Failed to load video' });
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
