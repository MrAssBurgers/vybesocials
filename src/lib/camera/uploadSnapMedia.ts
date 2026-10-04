/**
 * Shared one-shot upload for the snap flow: the asset is uploaded once and the
 * resulting URL is reused for every destination (all conversations + stories).
 */
import { db } from '@/lib/firebase';
import { firebaseStorage } from '@/lib/firebase/storageService';
import { withTimeout } from '@/lib/withTimeout';
import { compressImage, generateStoryThumbnail } from '@/lib/storyUtils';
import { reportAccountGuard, isReportSessionError } from '@/lib/reportModerationService';

export interface SnapUploadResult {
  mediaUrl: string;
  thumbnailUrl?: string;
}

export interface UploadSnapMediaParams {
  file: File | Blob;
  isVideo: boolean;
  /** Auth user id — chat-media storage layout is `${authUserId}/…`. */
  authUserId: string;
  onProgress?: (fraction: number) => void;
  accountGuard?: () => void;
}

function snapExtension(file: File | Blob, isVideo: boolean): string {
  const type = file.type || '';
  if (isVideo) return type.includes('mp4') ? 'mp4' : 'webm';
  return type.includes('png') ? 'png' : 'jpg';
}

/**
 * Upload snap media (and a story cover for videos) to the chat-media bucket.
 * The returned public URL is valid for both DM messages and story records.
 */
export async function uploadSnapMedia({
  file,
  isVideo,
  authUserId,
  onProgress,
  accountGuard = reportAccountGuard(authUserId),
}: UploadSnapMediaParams): Promise<SnapUploadResult> {
  accountGuard();
  let uploadFile: File | Blob = file;
  if (!isVideo && file instanceof File) {
    try {
      uploadFile = await compressImage(file);
    } catch {
      /* fall back to original */
    }
  }
  accountGuard();
  onProgress?.(0.2);

  const ext = snapExtension(uploadFile, isVideo);
  const fileName = `${authUserId}/${Date.now()}_snap.${ext}`;
  const contentType =
    uploadFile.type || (isVideo ? 'video/webm' : 'image/jpeg');

  const { error: uploadError } = await withTimeout(
    db.storage.from('chat-media').upload(fileName, uploadFile, {
      contentType,
      cacheControl: '31536000',
    }),
    120000,
    'Upload timed out. Check your connection and try again.',
  );
  if (uploadError) {
    throw new Error(uploadError.message || 'Upload failed');
  }
  accountGuard();
  onProgress?.(0.75);

  // Prefer a real https download URL (renders everywhere, including stories);
  // fall back to the gs:// placeholder the chat renderer already resolves.
  const publicUrl =
    (await firebaseStorage.resolveDownloadUrl('chat-media', fileName)) ||
    db.storage.from('chat-media').getPublicUrl(fileName).data.publicUrl;
  accountGuard();
  if (!publicUrl) throw new Error('Failed to get media URL after upload');

  let thumbnailUrl: string | undefined;
  if (isVideo && file instanceof File) {
    try {
      const thumbBlob = await generateStoryThumbnail(file, true);
      accountGuard();
      if (thumbBlob) {
        const thumbName = `${authUserId}/${Date.now()}_snap_thumb.jpg`;
        const { error: thumbError } = await withTimeout(
          db.storage.from('chat-media').upload(thumbName, thumbBlob, {
            contentType: 'image/jpeg',
            cacheControl: '31536000',
          }),
          60000,
          'Cover upload timed out',
        );
        if (!thumbError) {
          accountGuard();
          thumbnailUrl =
            (await firebaseStorage.resolveDownloadUrl('chat-media', thumbName)) ||
            undefined;
        }
      }
    } catch (error) {
      if (isReportSessionError(error)) throw error;
      /* thumbnail is best-effort */
    }
  }

  accountGuard();
  onProgress?.(1);
  return { mediaUrl: publicUrl, thumbnailUrl };
}
