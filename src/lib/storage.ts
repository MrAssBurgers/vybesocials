import { supabase } from '@/integrations/supabase/client';

/**
 * Extracts bucket and path from a Supabase storage URL
 */
export function parseStorageUrl(url: string): { bucket: string; path: string } | null {
  if (!url) return null;
  
  // Match Supabase storage URLs
  // Format: https://[project-ref].supabase.co/storage/v1/object/public/[bucket]/[path]
  const publicMatch = url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
  if (publicMatch) {
    return { bucket: publicMatch[1], path: publicMatch[2] };
  }
  
  // Format: https://[project-ref].supabase.co/storage/v1/object/sign/[bucket]/[path]
  const signedMatch = url.match(/\/storage\/v1\/object\/sign\/([^/]+)\/([^?]+)/);
  if (signedMatch) {
    return { bucket: signedMatch[1], path: signedMatch[2] };
  }
  
  return null;
}

/**
 * Creates a signed URL for a storage object
 * @param bucket - The storage bucket name
 * @param path - The file path within the bucket
 * @param expiresIn - Expiration time in seconds (default: 1 hour)
 */
export async function createSignedUrl(
  bucket: string,
  path: string,
  expiresIn: number = 3600
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);
  
  if (error) {
    console.error('Failed to create signed URL:', error);
    return null;
  }
  
  return data.signedUrl;
}

/**
 * Converts a public storage URL to a signed URL
 * Returns the original URL if it's not a Supabase storage URL
 */
export async function getSignedUrlFromPublic(url: string): Promise<string> {
  if (!url) return url;
  
  const parsed = parseStorageUrl(url);
  if (!parsed) {
    // Not a Supabase storage URL, return as-is
    return url;
  }
  
  const signedUrl = await createSignedUrl(parsed.bucket, parsed.path);
  return signedUrl || url;
}

/**
 * Uploads a file and returns a signed URL instead of public URL
 */
export async function uploadFile(
  bucket: string,
  path: string,
  file: File | Blob
): Promise<{ url: string; path: string } | null> {
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(path, file);
  
  if (uploadError) {
    console.error('Upload failed:', uploadError);
    return null;
  }
  
  // Return the public URL path (will be converted to signed when displayed)
  const { data: { publicUrl } } = supabase.storage
    .from(bucket)
    .getPublicUrl(path);
  
  return { url: publicUrl, path };
}
