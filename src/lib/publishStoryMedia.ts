import { db } from '@/lib/firebase';
import { firebaseStorage } from '@/lib/firebase/storageService';
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

/** Upload story media (+ optional cover) to stories bucket. */
export async function publishStoryMedia({
  file,
  isVideo,
  thumbnailBlob,
  onProgress,
}: PublishStoryMediaParams): Promise<PublishStoryMediaResult> {
  const { data: { user } } = await db.auth.getUser();
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
    db.storage.from('stories').upload(fileName, fileToUpload, {
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
      db.storage.from('stories').upload(thumbFileName, thumbnailBlob, {
        cacheControl: '3600',
        upsert: false,
        contentType: 'image/jpeg',
      }),
      60000,
      'Cover upload timed out',
    );

    if (!thumbUploadError) {
      thumbnailUrl =
        (await firebaseStorage.resolveDownloadUrl('stories', thumbFileName)) || undefined;
    }
  }

  const mediaUrl =
    (await firebaseStorage.resolveDownloadUrl('stories', fileName)) ||
    (await firebaseStorage.resolveMediaUrl(`gs://stories/${fileName}`));
  if (!mediaUrl || mediaUrl.startsWith('gs://')) {
    throw new Error('Failed to get story media URL after upload');
  }

  onProgress?.(85);
  return { mediaUrl, thumbnailUrl };
}
