import { useState, useCallback } from 'react';

export interface ProcessedVideo {
  blob: Blob;
  thumbnail: string; // base64 data URL
  duration: number;
  width: number;
  height: number;
  originalSize: number;
  compressedSize: number;
}

export interface VideoProcessingState {
  status: 'idle' | 'processing' | 'done' | 'error';
  progress: number;
  error?: string;
}

/**
 * Extract a thumbnail from a video at a specific time
 */
async function extractThumbnail(
  video: HTMLVideoElement,
  time: number = 1
): Promise<string> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      reject(new Error('Could not get canvas context'));
      return;
    }

    const handleSeeked = () => {
      video.removeEventListener('seeked', handleSeeked);
      
      // Use video dimensions, capped at 480px for thumbnail
      const maxSize = 480;
      const scale = Math.min(maxSize / video.videoWidth, maxSize / video.videoHeight, 1);
      canvas.width = video.videoWidth * scale;
      canvas.height = video.videoHeight * scale;
      
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Convert to JPEG for smaller file size
      const thumbnail = canvas.toDataURL('image/jpeg', 0.8);
      resolve(thumbnail);
    };

    video.addEventListener('seeked', handleSeeked);
    video.currentTime = Math.min(time, video.duration || time);
  });
}

/**
 * Get video metadata (duration, dimensions)
 */
async function getVideoMetadata(
  file: File
): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    
    const handleLoaded = () => {
      video.removeEventListener('loadedmetadata', handleLoaded);
      URL.revokeObjectURL(video.src);
      
      resolve({
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
      });
    };

    const handleError = () => {
      video.removeEventListener('error', handleError);
      URL.revokeObjectURL(video.src);
      reject(new Error('Failed to load video metadata'));
    };

    video.addEventListener('loadedmetadata', handleLoaded);
    video.addEventListener('error', handleError);
    video.src = URL.createObjectURL(file);
  });
}

/**
 * Format duration as MM:SS
 */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Process a video file: extract thumbnail, get metadata
 * Note: Full compression would require WebCodecs API or server-side processing
 * For now, we just extract metadata and thumbnail
 */
export async function processVideo(
  file: File,
  onProgress?: (progress: number) => void
): Promise<ProcessedVideo> {
  onProgress?.(10);
  
  // Create video element for processing
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  
  const videoUrl = URL.createObjectURL(file);
  
  try {
    // Load video
    await new Promise<void>((resolve, reject) => {
      const handleCanPlay = () => {
        video.removeEventListener('canplaythrough', handleCanPlay);
        resolve();
      };
      const handleError = () => {
        video.removeEventListener('error', handleError);
        reject(new Error('Failed to load video'));
      };
      
      video.addEventListener('canplaythrough', handleCanPlay);
      video.addEventListener('error', handleError);
      video.src = videoUrl;
      video.load();
    });
    
    onProgress?.(30);
    
    // Extract thumbnail at 1 second or 10% of duration
    const thumbnailTime = Math.min(1, video.duration * 0.1);
    const thumbnail = await extractThumbnail(video, thumbnailTime);
    
    onProgress?.(60);
    
    // For now, we return the original file
    // True compression would require WebCodecs API or server-side processing
    const compressedBlob = file;
    
    onProgress?.(100);
    
    return {
      blob: compressedBlob,
      thumbnail,
      duration: video.duration,
      width: video.videoWidth,
      height: video.videoHeight,
      originalSize: file.size,
      compressedSize: compressedBlob.size,
    };
  } finally {
    URL.revokeObjectURL(videoUrl);
  }
}

/**
 * Hook for processing videos with state management
 */
export function useVideoProcessor() {
  const [state, setState] = useState<VideoProcessingState>({
    status: 'idle',
    progress: 0,
  });

  const process = useCallback(async (file: File): Promise<ProcessedVideo | null> => {
    setState({ status: 'processing', progress: 0 });
    
    try {
      const result = await processVideo(file, (progress) => {
        setState((prev) => ({ ...prev, progress }));
      });
      
      setState({ status: 'done', progress: 100 });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Processing failed';
      setState({ status: 'error', progress: 0, error: message });
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    setState({ status: 'idle', progress: 0 });
  }, []);

  return {
    ...state,
    process,
    reset,
    isProcessing: state.status === 'processing',
  };
}
