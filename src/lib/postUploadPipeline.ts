/** Check/upload first, then submit one immutable, recoverable server publication. */
import { db } from '@/lib/firebase';
import { firebaseStorage } from '@/lib/firebase/storageService';
import { filterBlockedContent } from '@/lib/contentModeration';
import { optimizeForUpload, isVideoFile, generateVideoThumbnail, getCompressedExtension } from '@/lib/mediaOptimizer';
import { withTimeout } from '@/lib/withTimeout';
import { moderateContent } from '@/hooks/useModeration';
import { runPublishVybeCheck } from '@/lib/vybeCheck/runPublishVybeCheck';
import { reportAccountGuard } from './reportModerationService';
import { getPreparedPost, legacyPostFromReceipt, preparePostCreate, submitPreparedPost } from './postCreateAttempts';
import type { PostPublishPayload } from './postMutationService';

export type PostUploadStage = 'optimizing' | 'uploading' | 'vybe_check' | 'publishing' | 'done' | 'failed';
export interface PostUploadInput {
  profile: { id: string; user_id: string }; clientPostId?: string; mediaFile?: File; mediaFiles?: File[];
  caption: string; tags: string[]; type: 'short' | 'post' | 'video' | 'text';
  thumbnailFile?: File; thumbnailDataUrl?: string; age_rating?: 'safe' | '13+' | '18+'; gameCaptureId?: string;
  visibility?: 'public' | 'followers' | 'friends' | 'close_friends' | 'only_me';
}
export type PostUploadProgress = (stage: PostUploadStage, progress: number) => void;
type UploadedPost = ReturnType<typeof legacyPostFromReceipt>;
export type PostUploadResult = { postId: string; post: UploadedPost; created: boolean } | { failed: true; reason: string };
type PreparedUpload = { blob: Blob; ext: string; contentType?: string; sourceFile: File };
async function prepareUploadBlob(file: File): Promise<PreparedUpload> {
  if (!isVideoFile(file)) {
    try { const optimized = await optimizeForUpload(file, 'post'); return { blob: optimized.file, ext: optimized.extension, contentType: 'image/' + optimized.extension, sourceFile: file }; }
    catch { /* Original bytes are a fallback, not a safety certification. */ }
  }
  const ext = file.name.split('.').pop() || (isVideoFile(file) ? 'mp4' : 'jpg');
  return { blob: file, ext: /^[a-z0-9]{1,10}$/i.test(ext) ? ext : 'bin', contentType: file.type || undefined, sourceFile: file };
}
export async function runPostUpload(input: PostUploadInput, onProgress: PostUploadProgress, suppliedGuard?: () => void): Promise<PostUploadResult> {
  const profile = { ...input.profile }, account = reportAccountGuard(profile.user_id);
  const guard = () => { account(); suppliedGuard?.(); };
  const progress: PostUploadProgress = (stage, value) => { guard(); onProgress(stage, value); };
  const quarantine: string[] = [];
  const cleanup = async () => { try { guard(); if (quarantine.length) await db.storage.from('media').remove(quarantine); } catch { /* Never dispatch cleanup under a retired account. */ } };
  const postId = input.gameCaptureId ? 'game_' + input.gameCaptureId : input.clientPostId || crypto.randomUUID();
  try {
    guard(); if (!profile.id || !profile.user_id) throw new Error('Please sign in again to post.');
    const actor = { uid: profile.user_id, profileId: profile.id };
    const retained = getPreparedPost(actor.uid, postId);
    if (retained) {
      if (retained.actor.profileId !== actor.profileId) throw new Error('Your profile changed. Reopen this pending publication.');
      progress('publishing', 90); const state = await submitPreparedPost(retained, guard); guard(); progress('done', 100);
      return { postId, post: legacyPostFromReceipt(state), created: state.created };
    }
    if (input.gameCaptureId) {
      const { findGameCapturePost } = await import('./gameCapturePost'); guard();
      const existing = await findGameCapturePost(input.gameCaptureId, profile.id, guard); guard();
      if (existing) { progress('done', 100); return { postId, post: existing as UploadedPost, created: false }; }
      const { getGameCapture } = await import('./gameCaptureService'); guard();
      const capture = await getGameCapture(input.gameCaptureId); guard();
      if (capture.status !== 'ready') throw new Error('This capture is not ready to publish.');
    }
    const { RATE_LIMITS } = await import('@/lib/rateLimit'); guard();
    if (!RATE_LIMITS.createPost()) throw new Error('Slow down — up to 5 posts per minute.');
    const caption = filterBlockedContent(input.caption), tags = [...input.tags];
    const files = input.mediaFiles?.length ? [...input.mediaFiles] : input.mediaFile ? [input.mediaFile] : [];
    progress('optimizing', 8); const prepared = await Promise.all(files.map(prepareUploadBlob)); guard();
    progress('uploading', 18);
    // Observe rejection even when an upload fails before the check is awaited.
    const check = runPublishVybeCheck({ caption, tags, mediaFiles: files, contentType: input.type }, guard)
      .then(value => ({ value }), error => ({ error }));
    const upload = async (path: string, blob: Blob, contentType?: string) => {
      guard(); const { error } = await withTimeout(db.storage.from('media').upload(path, blob, { contentType, upsert: true }), 120000, 'Upload timed out. Retry the same draft.');
      guard(); if (error) throw error;
    };
    for (let i = 0; i < prepared.length; i++) {
      const item = prepared[i], path = actor.uid + '/quarantine/' + postId + '/media-' + i + '.' + item.ext;
      await upload(path, item.blob, item.contentType); quarantine.push(path); progress('uploading', 20 + Math.round(i / prepared.length * 35));
    }
    progress('vybe_check', 58); const checked = await check; guard(); if ('error' in checked) throw checked.error;
    const vybe = checked.value;
    if (vybe.blocked || !vybe.allowed) throw new Error(vybe.message || 'Publishing failed — Vybe Check did not pass.');
    const uploadPublic = async (path: string, blob: Blob, contentType?: string) => {
      await upload(path, blob, contentType); guard(); const url = await firebaseStorage.resolveDownloadUrl('media', path); guard();
      if (!url) throw new Error('Uploaded media could not be resolved. Retry the same draft.'); return url;
    };
    progress('publishing', 78); const urls: string[] = [];
    for (let i = 0; i < prepared.length; i++) {
      const item = prepared[i]; urls.push(await uploadPublic(actor.uid + '/posts/' + postId + '/media-' + i + '.' + item.ext, item.blob, item.contentType));
    }
    let thumbnail: string | null = null;
    try {
      guard(); let blob: Blob | undefined = input.thumbnailFile;
      if (!blob && input.thumbnailDataUrl) {
        if (!input.thumbnailDataUrl.startsWith('data:image/')) throw new Error('Unsupported thumbnail source.');
        blob = await (await fetch(input.thumbnailDataUrl)).blob(); guard();
      }
      if (!blob && prepared[0] && isVideoFile(prepared[0].sourceFile)) { blob = await withTimeout(generateVideoThumbnail(prepared[0].sourceFile), 12000, 'Thumbnail timed out.'); guard(); }
      if (blob) { const ext = getCompressedExtension(); thumbnail = await uploadPublic(actor.uid + '/posts/' + postId + '/thumbnail.' + ext, blob, blob.type || 'image/' + ext); }
    } catch { guard(); /* Thumbnail failure is optional, an account change is not. */ }
    const payload: PostPublishPayload = { type: input.type === 'text' ? 'post' : input.type, caption, tags, mediaUrl: urls[0] || null,
      mediaUrls: urls.length > 1 ? urls : [], thumbnailUrl: thumbnail, ageRating: input.age_rating || vybe.ageRating, visibility: input.visibility || 'public',
      vybeCheckId: vybe.checkId ?? null, ...(input.gameCaptureId ? { gameCaptureId: input.gameCaptureId } : {}) };
    guard(); const attempt = preparePostCreate(actor, postId, payload); progress('publishing', 90);
    const state = await submitPreparedPost(attempt, guard); guard(); await cleanup(); progress('done', 100);
    if (state.created) {
      if (caption.trim()) { guard(); void moderateContent(caption, 'post', postId).catch(() => {}); }
      void import('@/lib/aiDetection').then(({ detectAIContent }) => { guard(); return detectAIContent(postId, files[0], caption, guard); }).catch(() => {});
    }
    return { postId, post: legacyPostFromReceipt(state), created: state.created };
  } catch (error) {
    await cleanup(); return { failed: true, reason: error instanceof Error ? error.message : 'Publishing could not be confirmed. Retry the same draft.' };
  }
}
