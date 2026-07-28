/**
 * Background post upload — optimize → upload (quarantine) overlapping Vybe Check → publish.
 * Media is never inserted as a public post until Vybe Check passes.
 */
import { db } from '@/lib/firebase';
import { filterBlockedContent } from '@/lib/contentModeration';
import {
  optimizeForUpload,
  isVideoFile,
  generateVideoThumbnail,
  getCompressedExtension,
} from '@/lib/mediaOptimizer';
import { withTimeout } from '@/lib/withTimeout';
import { moderateContent } from '@/hooks/useModeration';
import { runPublishVybeCheck, type PublishAgeRating } from '@/lib/vybeCheck/runPublishVybeCheck';
import {
  awaitPendingFirestoreWrites,
  getDocumentFromServer,
} from '@/lib/firebase/firestoreDb';

export type PostUploadStage =
  | 'optimizing'
  | 'uploading'
  | 'vybe_check'
  | 'publishing'
  | 'done'
  | 'failed';

export interface PostUploadInput {
  profile: { id: string; user_id: string };
  /** Stable across retries so storage writes and the post document are idempotent. */
  clientPostId?: string;
  mediaFile?: File;
  mediaFiles?: File[];
  caption: string;
  tags: string[];
  type: 'short' | 'post' | 'video' | 'text';
}

export type PostUploadProgress = (stage: PostUploadStage, progress: number) => void;

type PreparedUpload = {
  blob: Blob;
  ext: string;
  contentType?: string;
  sourceFile: File;
};

async function prepareUploadBlob(file: File): Promise<PreparedUpload> {
  if (!isVideoFile(file)) {
    try {
      const optimized = await optimizeForUpload(file, 'post');
      return {
        blob: optimized.file,
        ext: optimized.extension,
        contentType: `image/${optimized.extension}`,
        sourceFile: file,
      };
    } catch {
      /* use original */
    }
  }
  const ext = file.name.split('.').pop() || (isVideoFile(file) ? 'mp4' : 'jpg');
  return { blob: file, ext, contentType: file.type || undefined, sourceFile: file };
}

async function removeStoragePaths(paths: string[]) {
  if (paths.length === 0) return;
  try {
    await db.storage.from('media').remove(paths);
  } catch {
    /* best-effort cleanup */
  }
}

async function promoteQuarantineToPublic(
  prepared: PreparedUpload[],
  authUserId: string,
  clientPostId: string,
): Promise<{ publicUrl: string; mediaUrls: string[] | null; thumbnailUrl: string | null }> {
  const uploadedUrls: string[] = [];
  for (let i = 0; i < prepared.length; i++) {
    const item = prepared[i];
    const publicPath = `${authUserId}/posts/${clientPostId}/media-${i}.${item.ext}`;
    const { error } = await withTimeout(
      db.storage.from('media').upload(publicPath, item.blob, {
        contentType: item.contentType,
        upsert: true,
      }),
      120_000,
      'Upload timed out.',
    );
    if (error) throw error;
    const {
      data: { publicUrl: url },
    } = db.storage.from('media').getPublicUrl(publicPath);
    uploadedUrls.push(url);
  }

  let thumbnailUrl: string | null = null;
  const primary = prepared[0];
  if (primary && isVideoFile(primary.sourceFile)) {
    try {
      const thumbBlob = await withTimeout(
        generateVideoThumbnail(primary.sourceFile),
        12_000,
        'Thumbnail timed out',
      );
      const thumbExt = getCompressedExtension();
      const thumbFileName = `${authUserId}/posts/${clientPostId}/thumbnail.${thumbExt}`;
      const { error: thumbErr } = await db.storage.from('media').upload(thumbFileName, thumbBlob, {
        contentType: `image/${thumbExt}`,
        upsert: true,
      });
      if (!thumbErr) {
        const {
          data: { publicUrl: thumbUrl },
        } = db.storage.from('media').getPublicUrl(thumbFileName);
        thumbnailUrl = thumbUrl;
      }
    } catch {
      /* optional */
    }
  }

  return {
    publicUrl: uploadedUrls[0],
    mediaUrls: uploadedUrls.length > 1 ? uploadedUrls : null,
    thumbnailUrl,
  };
}

type ConfirmedPost = {
  id?: string;
  author_id?: string;
};

/** Confirm the write reached Firestore, rather than only its local cache. */
async function confirmPostWrite(postId: string, authorId: string): Promise<ConfirmedPost> {
  await awaitPendingFirestoreWrites();
  for (let attempt = 0; attempt < 8; attempt++) {
    const row = await getDocumentFromServer<ConfirmedPost>('posts', postId).catch(() => null);
    if (row?.id === postId && row.author_id === authorId) return row;
    await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
  }
  throw new Error('Post was saved locally but could not be confirmed. Your draft is ready to retry.');
}

export async function runPostUpload(
  input: PostUploadInput,
  onProgress: PostUploadProgress,
): Promise<{ postId: string } | { failed: true; reason: string }> {
  const { profile } = input;

  if (!profile?.id || !profile?.user_id) {
    return { failed: true, reason: 'Please sign in again to post.' };
  }

  const { RATE_LIMITS } = await import('@/lib/rateLimit');
  if (!RATE_LIMITS.createPost()) {
    return { failed: true, reason: 'Slow down — up to 5 posts per minute.' };
  }

  const filteredCaption = filterBlockedContent(input.caption);
  const authUserId = profile.user_id;
  const clientPostId = input.clientPostId || crypto.randomUUID();
  const primaryFile = input.mediaFile ?? input.mediaFiles?.[0];
  const files: File[] =
    input.mediaFiles && input.mediaFiles.length > 0
      ? input.mediaFiles
      : input.mediaFile
        ? [input.mediaFile]
        : [];

  const quarantinePaths: string[] = [];

  try {
    onProgress('optimizing', 8);
    const prepared = await Promise.all(files.map((f) => prepareUploadBlob(f)));

    // Overlap quarantine upload with Vybe Check (check uses local files)
    onProgress('uploading', 18);
    const checkPromise = runPublishVybeCheck({
      caption: filteredCaption,
      tags: input.tags,
      mediaFile: input.mediaFile,
      mediaFiles: input.mediaFiles,
      contentType: input.type === 'text' ? 'text' : input.type,
    }).then((result) => {
      onProgress('vybe_check', 62);
      return result;
    });

    if (prepared.length > 0) {
      for (let i = 0; i < prepared.length; i++) {
        const item = prepared[i];
        onProgress('uploading', 20 + Math.round((i / prepared.length) * 35));
        const qPath = `quarantine/${authUserId}/${clientPostId}/media-${i}.${item.ext}`;
        const { error: uploadError } = await withTimeout(
          db.storage.from('media').upload(qPath, item.blob, {
            contentType: item.contentType,
            upsert: true,
          }),
          120_000,
          'Upload timed out.',
        );
        if (uploadError) throw uploadError;
        quarantinePaths.push(qPath);
      }
    }

    onProgress('vybe_check', 58);
    const vybe = await checkPromise;

    if (vybe.blocked || !vybe.allowed) {
      await removeStoragePaths(quarantinePaths);
      return {
        failed: true,
        reason: vybe.message || 'Publishing failed — Vybe Check did not pass.',
      };
    }

    const ageRating: PublishAgeRating = vybe.ageRating;
    onProgress('publishing', 78);

    let publicUrl: string | null = null;
    let mediaUrls: string[] | null = null;
    let thumbnailUrl: string | null = null;

    if (prepared.length > 0) {
      const promoted = await promoteQuarantineToPublic(prepared, authUserId, clientPostId);
      publicUrl = promoted.publicUrl;
      mediaUrls = promoted.mediaUrls;
      thumbnailUrl = promoted.thumbnailUrl;
    }

    onProgress('publishing', 90);
    const postType = input.type === 'text' ? 'post' : input.type;
    const { data: post, error } = await withTimeout(
      db
        .from('posts')
        .insert({
          id: clientPostId,
          author_id: profile.id,
          type: postType,
          media_url: publicUrl,
          media_urls: mediaUrls,
          thumbnail_url: thumbnailUrl,
          caption: filteredCaption,
          tags: input.tags,
          age_rating: ageRating,
          vybe_check_id: vybe.checkId ?? null,
          vybe_check_status: 'approved',
        } as Record<string, unknown>)
        .select()
        .single(),
      60_000,
      'Saving post timed out.',
    );

    if (error) throw error;
    if (!post?.id) throw new Error('Post was not created');

    await withTimeout(
      confirmPostWrite(clientPostId, profile.id),
      30_000,
      'Post confirmation timed out. Your draft is ready to retry.',
    );
    await removeStoragePaths(quarantinePaths);

    onProgress('done', 100);

    if (filteredCaption.trim()) {
      void moderateContent(filteredCaption, 'post', post.id).catch(console.error);
    }
    void import('@/lib/aiDetection').then(({ detectAIContent }) => {
      detectAIContent(post.id, primaryFile, filteredCaption).catch(console.error);
    });

    return { postId: clientPostId };
  } catch (err: unknown) {
    await removeStoragePaths(quarantinePaths);
    const msg = err instanceof Error ? err.message : 'Publishing failed. Please try again.';
    return { failed: true, reason: msg };
  }
}
