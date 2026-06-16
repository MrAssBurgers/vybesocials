import { getNewWritesClient } from '@/lib/dualSupabase';
import { withTimeout } from '@/lib/withTimeout';
import {
  compressImage,
  generateStoryFileName,
  generateStoryThumbnailFileName,
  storyUploadContentType,
} from '@/lib/storyUtils';

export interface PublishStoryMediaParams {
  file: File | Blob;
  isVideo: boolean;
  thumbnailBlob?: Blob | null;
  onProgress?: (progress: number) => void;
}

export interface PublishStoryMediaResult {
  mediaUrl: string;
  thumbnailUrl?: string;
}

/** Upload story media (+ optional cover) to hprmic stories bucket. */
export async function publishStoryMedia({
  file,
  isVideo,
  thumbnailBlob,
  onProgress,
}: PublishStoryMediaParams): Promise<PublishStoryMediaResult> {
  const writeClient = getNewWritesClient();
  const { data: { user } } = await writeClient.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  let fileToUpload: File | Blob = file;
  if (!isVideo && file instanceof File) {
    try {
      fileToUpload = await compressImage(file);
      onProgress?.(30);
    } catch {
      /* use original */
    }
  }

  onProgress?.(40);

  const fileName = generateStoryFileName(user.id, isVideo ? 'video' : 'image');
  const mainContentType = storyUploadContentType(fileToUpload, isVideo ? 'video' : 'image');

  const { error: uploadError } = await withTimeout(
    writeClient.storage.from('stories').upload(fileName, fileToUpload, {
      cacheControl: '3600',
      upsert: false,
      contentType: mainContentType,
    }),
    120000,
    'Upload timed out. Check your connection and try again.',
  );

  if (uploadError) {
    const msg = uploadError.message || 'Upload failed';
    if (/mime|content.?type|invalid file type/i.test(msg)) {
      throw new Error('This file type is not supported for stories. Try JPG or MP4.');
    }
    if (/row-level security|policy|403|401|Unauthorized/i.test(msg)) {
      throw new Error('Upload blocked by permissions. Sign out and back in, then try again.');
    }
    throw new Error(`Upload failed: ${msg}`);
  }

  onProgress?.(70);

  let thumbnailUrl: string | undefined;
  if (thumbnailBlob) {
    const thumbFileName = generateStoryThumbnailFileName(user.id);
    const { error: thumbUploadError } = await withTimeout(
      writeClient.storage.from('stories').upload(thumbFileName, thumbnailBlob, {
        cacheControl: '3600',
        upsert: false,
        contentType: 'image/jpeg',
      }),
      60000,
      'Cover upload timed out',
    );

    if (!thumbUploadError) {
      const { data: { publicUrl: thumbPublicUrl } } = writeClient.storage
        .from('stories')
        .getPublicUrl(thumbFileName);
      thumbnailUrl = thumbPublicUrl || undefined;
    }
  }

  const { data: { publicUrl } } = writeClient.storage.from('stories').getPublicUrl(fileName);
  if (!publicUrl) throw new Error('Failed to get public URL');

  onProgress?.(85);
  return { mediaUrl: publicUrl, thumbnailUrl };
}
