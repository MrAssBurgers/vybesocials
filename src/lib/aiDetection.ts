/**
 * AI Content Detection Client
 * 
 * Sends images to the detect-ai-content edge function
 * to determine if content is AI-generated.
 */

import { supabase } from '@/integrations/supabase/client';

interface AIDetectionResult {
  is_ai: boolean;
  confidence: number;
  reason: string;
}

/**
 * Detect if an image is AI-generated (runs in background after post creation)
 */
export async function detectAIContent(
  postId: string,
  file?: File,
  caption?: string
): Promise<AIDetectionResult> {
  try {
    let image_base64: string | undefined;
    let mime_type: string | undefined;

    if (file && file.type.startsWith('image/')) {
      // Convert to base64, resize down for efficiency
      image_base64 = await fileToBase64Resized(file, 512);
      mime_type = file.type;
    }

    // Skip if no image and no caption
    if (!image_base64 && !caption) {
      return { is_ai: false, confidence: 0, reason: 'No content to analyze' };
    }

    const { data, error } = await supabase.functions.invoke('detect-ai-content', {
      body: { image_base64, mime_type, caption, post_id: postId },
    });

    if (error) {
      console.warn('AI detection failed:', error);
      return { is_ai: false, confidence: 0, reason: 'Detection unavailable' };
    }

    return data as AIDetectionResult;
  } catch (err) {
    console.warn('AI detection error:', err);
    return { is_ai: false, confidence: 0, reason: 'Detection failed' };
  }
}

async function fileToBase64Resized(file: File, maxSize: number): Promise<string> {
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
