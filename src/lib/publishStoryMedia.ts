import { db } from '@/lib/firebase';
import { firebaseStorage } from '@/lib/firebase/storageService';
import { reportAccountGuard } from '@/lib/reportModerationService';
import { compressImage, generateStoryFileName, generateStoryThumbnailFileName, storyUploadContentType } from '@/lib/storyUtils';

type UploadResult = Awaited<ReturnType<ReturnType<typeof db.storage.from>['upload']>>;
export interface StoryMediaCheckpoint {
  owner?: string;
  file?: File | Blob;
  isVideo?: boolean;
  fileName?: string;
  thumbnailName?: string;
  thumbnail?: Blob | null;
  compressed?: Promise<File | Blob>;
  mainUpload?: Promise<UploadResult>;
  coverUpload?: Promise<UploadResult>;
  mediaUrl?: string;
  thumbnailUrl?: string;
}
export const createStoryMediaCheckpoint = (): StoryMediaCheckpoint => ({});
export interface PublishStoryMediaParams {
  file: File | Blob;
  isVideo: boolean;
  thumbnailBlob?: Blob | null;
  expectedOwnerUid: string;
  accountGuard?: () => void;
  checkpoint?: StoryMediaCheckpoint;
  onProgress?: (progress: number) => void;
}
export interface PublishStoryMediaResult { mediaUrl: string; thumbnailUrl?: string }

/** Each stage is retained separately, including work still pending at a UI timeout. */
export async function publishStoryMedia({ file, isVideo, thumbnailBlob, expectedOwnerUid, accountGuard,
  checkpoint = createStoryMediaCheckpoint(), onProgress }: PublishStoryMediaParams): Promise<PublishStoryMediaResult> {
  const ownerGuard = reportAccountGuard(expectedOwnerUid);
  const guard = () => { ownerGuard(); accountGuard?.(); };
  const progress = (value: number) => { guard(); onProgress?.(value); };
  guard();
  if (checkpoint.owner && (checkpoint.owner !== expectedOwnerUid || checkpoint.file !== file || checkpoint.isVideo !== isVideo)) {
    throw new Error('Start a new story before changing this upload.');
  }
  if (!checkpoint.owner) {
    Object.assign(checkpoint, { owner: expectedOwnerUid, file, isVideo, thumbnail: thumbnailBlob,
      fileName: generateStoryFileName(expectedOwnerUid, isVideo ? 'video' : 'image'),
      thumbnailName: generateStoryThumbnailFileName(expectedOwnerUid) });
  }
  checkpoint.compressed ??= !isVideo && file instanceof File ? compressImage(file).catch(() => file) : Promise.resolve(file);
  const uploadFile = await checkpoint.compressed;
  progress(40);
  if (!checkpoint.mainUpload) {
    checkpoint.mainUpload = db.storage.from('stories').upload(checkpoint.fileName!, uploadFile,
      { cacheControl: '3600', contentType: storyUploadContentType(uploadFile, isVideo ? 'video' : 'image') });
  }
  const main = await checkpoint.mainUpload;
  guard();
  if (main.error) {
    checkpoint.mainUpload = undefined;
    throw new Error(`Upload failed: ${main.error.message || 'Please try again.'}`);
  }
  progress(70);
  if (checkpoint.thumbnail) {
    checkpoint.coverUpload ??= db.storage.from('stories').upload(checkpoint.thumbnailName!, checkpoint.thumbnail,
      { cacheControl: '3600', contentType: 'image/jpeg' });
    const cover = await checkpoint.coverUpload;
    guard();
    if (cover.error) {
      checkpoint.coverUpload = undefined;
      throw new Error('The cover could not upload. Retry to keep your chosen cover.');
    }
    if (!checkpoint.thumbnailUrl) {
      checkpoint.thumbnailUrl = (await firebaseStorage.resolveDownloadUrl('stories', checkpoint.thumbnailName!)) || undefined;
      guard();
      if (!checkpoint.thumbnailUrl) throw new Error('Could not load the uploaded cover. Retry to finish.');
    }
  }
  if (!checkpoint.mediaUrl) {
    checkpoint.mediaUrl = (await firebaseStorage.resolveDownloadUrl('stories', checkpoint.fileName!)) || undefined;
    guard();
    if (!checkpoint.mediaUrl || checkpoint.mediaUrl.startsWith('gs://')) throw new Error('Could not load the uploaded story. Retry to finish.');
  }
  progress(85);
  return { mediaUrl: checkpoint.mediaUrl, thumbnailUrl: checkpoint.thumbnailUrl };
}
