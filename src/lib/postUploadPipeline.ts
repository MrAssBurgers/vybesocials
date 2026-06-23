/**
 * Background post upload — Vybe Check → optimize → upload → publish.
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

export type PostUploadStage =
  | 'optimizing'
  | 'vybe_check'
  | 'uploading'
  | 'publishing'
  | 'done'
  | 'failed';

export interface PostUploadInput {
  profile: { id: string; user_id: string };
  mediaFile?: File;
  mediaFiles?: File[];
  caption: string;
  tags: string[];
  type: 'short' | 'post' | 'video' | 'text';
}

export type PostUploadProgress = (stage: PostUploadStage, progress: number) => void;

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
  const primaryFile = input.mediaFile ?? input.mediaFiles?.[0];

  onProgress('vybe_check', 5);
  const vybe = await runPublishVybeCheck({
    caption: filteredCaption,
    tags: input.tags,
    mediaFile: input.mediaFile,
    mediaFiles: input.mediaFiles,
    contentType: input.type === 'text' ? 'text' : input.type,
  });

  if (vybe.blocked || !vybe.allowed) {
    return {
      failed: true,
      reason: vybe.message || 'Publishing failed — Vybe Check did not pass.',
    };
  }

  const ageRating: PublishAgeRating = vybe.ageRating;
  onProgress('optimizing', 18);

  let publicUrl: string | null = null;
  let mediaUrls: string[] | null = null;
  let thumbnailUrl: string | null = null;

  try {
    if (input.mediaFiles && input.mediaFiles.length > 0) {
      const uploadedUrls: string[] = [];
      for (let i = 0; i < input.mediaFiles.length; i++) {
        const file = input.mediaFiles[i];
        onProgress('uploading', 25 + Math.round((i / input.mediaFiles.length) * 50));
        let uploadBlob: Blob = file;
        let fileExt = file.name.split('.').pop() || 'jpg';
        if (!isVideoFile(file)) {
          try {
            const optimized = await optimizeForUpload(file, 'post');
            uploadBlob = optimized.file;
            fileExt = optimized.extension;
          } catch {
            /* use original */
          }
        }
        const fileName = `${authUserId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
        const { error: uploadError } = await withTimeout(
          db.storage.from('media').upload(fileName, uploadBlob),
          120_000,
          'Upload timed out.',
        );
        if (uploadError) throw uploadError;
        const { data: { publicUrl: url } } = db.storage.from('media').getPublicUrl(fileName);
        uploadedUrls.push(url);
      }
      publicUrl = uploadedUrls[0];
      mediaUrls = uploadedUrls;
    } else if (input.mediaFile) {
      onProgress('optimizing', 22);
      let uploadBlob: Blob = input.mediaFile;
      let fileExt = input.mediaFile.name.split('.').pop() || 'jpg';
      if (!isVideoFile(input.mediaFile)) {
        try {
          const optimized = await optimizeForUpload(input.mediaFile, 'post');
          uploadBlob = optimized.file;
          fileExt = optimized.extension;
        } catch {
          /* use original */
        }
      }
      onProgress('uploading', 45);
      const fileName = `${authUserId}/${Date.now()}.${fileExt}`;
      const { error: uploadError } = await withTimeout(
        db.storage.from('media').upload(fileName, uploadBlob),
        120_000,
        'Upload timed out.',
      );
      if (uploadError) throw uploadError;
      const { data: { publicUrl: url } } = db.storage.from('media').getPublicUrl(fileName);
      publicUrl = url;

      if (isVideoFile(input.mediaFile)) {
        try {
          const thumbBlob = await withTimeout(generateVideoThumbnail(input.mediaFile), 12_000, 'Thumbnail timed out');
          const thumbExt = getCompressedExtension();
          const thumbFileName = `${authUserId}/thumb_${Date.now()}.${thumbExt}`;
          const { error: thumbErr } = await db.storage.from('media').upload(thumbFileName, thumbBlob, {
            contentType: `image/${thumbExt}`,
          });
          if (!thumbErr) {
            const { data: { publicUrl: thumbUrl } } = db.storage.from('media').getPublicUrl(thumbFileName);
            thumbnailUrl = thumbUrl;
          }
        } catch {
          /* optional */
        }
      }
    }

    onProgress('publishing', 88);
    const postType = input.type === 'text' ? 'post' : input.type;
    const { data: post, error } = await withTimeout(
      db
        .from('posts')
        .insert({
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

    onProgress('done', 100);

    if (filteredCaption.trim()) {
      void moderateContent(filteredCaption, 'post', post.id).catch(console.error);
    }
    void import('@/lib/aiDetection').then(({ detectAIContent }) => {
      detectAIContent(post.id, primaryFile, filteredCaption).catch(console.error);
    });

    return { postId: post.id as string };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Publishing failed. Please try again.';
    return { failed: true, reason: msg };
  }
}
