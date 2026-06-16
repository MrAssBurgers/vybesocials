import { firebaseStorage } from '@/lib/firebase/storageService';

/**
 * Extracts bucket and path from a legacy Supabase storage URL or gs:// path.
 */
export function parseStorageUrl(url: string): { bucket: string; path: string } | null {
  if (!url) return null;

  const publicMatch = url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
  if (publicMatch) {
    return { bucket: publicMatch[1]!, path: publicMatch[2]! };
  }

  const signedMatch = url.match(/\/storage\/v1\/object\/sign\/([^/]+)\/([^?]+)/);
  if (signedMatch) {
    return { bucket: signedMatch[1]!, path: signedMatch[2]! };
  }

  const gsMatch = url.match(/^gs:\/\/([^/]+)\/(.+)$/);
  if (gsMatch) {
    return { bucket: gsMatch[1]!, path: gsMatch[2]! };
  }

  const firebaseMatch = url.match(/firebasestorage\.googleapis\.com\/v0\/b\/([^/]+)\/o\/([^?]+)/);
  if (firebaseMatch) {
    return { bucket: firebaseMatch[1]!, path: decodeURIComponent(firebaseMatch[2]!) };
  }

  return null;
}

export async function createSignedUrl(
  bucket: string,
  path: string,
  expiresIn: number = 3600,
): Promise<string | null> {
  const { data, error } = await firebaseStorage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export async function getSignedUrlFromPublic(url: string): Promise<string> {
  if (!url) return url;
  const parsed = parseStorageUrl(url);
  if (!parsed) return url;
  const signedUrl = await createSignedUrl(parsed.bucket, parsed.path);
  return signedUrl || url;
}

export async function uploadFile(
  bucket: string,
  path: string,
  file: File | Blob,
): Promise<{ url: string; path: string } | null> {
  const { error: uploadError } = await firebaseStorage.from(bucket).upload(path, file);
  if (uploadError) {
    console.error('Upload failed:', uploadError);
    return null;
  }

  const downloadUrl = await firebaseStorage.resolveDownloadUrl(bucket, path);
  return { url: downloadUrl || `gs://${bucket}/${path}`, path };
}
