import { useEffect, useRef, useState } from 'react';
import { useCreateStory } from './useStories';
import { useReportAccountSession } from './useReportAccountSession';
import { reportAccountGuard, reportAccountSnapshot } from '@/lib/reportModerationService';
import { createStoryComposerDraft } from '@/lib/storyComposerDraft';
import { publishStoryMedia, createStoryMediaCheckpoint } from '@/lib/publishStoryMedia';
import { runPublishVybeCheck } from '@/lib/vybeCheck';
import { generateStoryThumbnail, validateStoryMedia } from '@/lib/storyUtils';
import { withTimeout } from '@/lib/withTimeout';
import type { PollData } from '@/components/stories/StoryPollEditor';

export interface StoryComposerInput {
  file: File;
  isVideo: boolean;
  thumbnailBlob?: Blob | null;
  caption?: string;
  isCloseFriendsOnly?: boolean;
  pollData?: PollData | null;
}

/** Mount inside an account-keyed composer. No upload happens until submit. */
export function useStoryComposer() {
  const session = useReportAccountSession();
  const createStory = useCreateStory();
  const mounted = useRef(false);
  const busyRef = useRef(false);
  const generation = useRef(0);
  const draft = useRef(createStoryComposerDraft());
  const media = useRef(createStoryMediaCheckpoint());
  const inputRef = useRef<StoryComposerInput>();
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; }; }, []);

  const reset = () => {
    if (busyRef.current) return;
    generation.current++;
    draft.current = createStoryComposerDraft();
    media.current = createStoryMediaCheckpoint();
    inputRef.current = undefined;
    setLocked(false);
  };

  const submit = async (input: StoryComposerInput, onProgress?: (phase: 'validating' | 'uploading' | 'saving', value: number) => void) => {
    if (busyRef.current) return undefined;
    const current = reportAccountSnapshot();
    if (current.uid !== session.uid || current.epoch !== session.epoch) throw new Error('Your account changed. Open the story editor again.');
    const accountGuard = reportAccountGuard(session.uid);
    const started = generation.current;
    const guard = () => {
      accountGuard();
      if (!mounted.current || generation.current !== started) throw new Error('This story editor has closed.');
    };
    guard();
    if (!session.uid) throw new Error('Sign in to post stories.');
    busyRef.current = true;
    setBusy(true);
    const activeDraft = draft.current;
    // Keep every submitted field together on retry. UI disables editing once
    // submission begins; only an explicit reset can create another identity.
    setLocked(true);
    if (!inputRef.current) inputRef.current = { ...input, caption: input.caption?.trim() || undefined,
      pollData: input.pollData ? { ...input.pollData, options: [...input.pollData.options] } : undefined };
    const captured = inputRef.current!;
    let reportsProgress = true;
    const progress = (phase: 'validating' | 'uploading' | 'saving', value: number) => {
      guard();
      // Preparation can continue after a UI timeout so an unchanged retry can
      // reuse it. Its retired callback must not replace the visible retry state.
      if (reportsProgress) onProgress?.(phase, value);
    };
    try {
      const uploaded = await withTimeout(activeDraft.prepare(async () => {
        progress('validating', 5);
        const validation = await validateStoryMedia(captured.file);
        guard();
        if (!validation.valid) throw new Error(validation.error || 'Invalid story media.');
        const check = await withTimeout(runPublishVybeCheck({ caption: captured.caption || '', mediaFile: captured.file, contentType: 'story' }), 180_000, 'Vybe Check timed out. Please try again.');
        guard();
        if (check.blocked || !check.allowed) throw new Error(check.message || 'Story did not pass Vybe Check.');
        const thumbnailBlob = captured.thumbnailBlob ?? (captured.isVideo ? await generateStoryThumbnail(captured.file, true) : null);
        guard();
        progress('uploading', 40);
        const urls = await publishStoryMedia({ file: captured.file, isVideo: captured.isVideo, thumbnailBlob,
          expectedOwnerUid: session.uid!, accountGuard: guard, checkpoint: media.current,
          onProgress: value => progress('uploading', value) });
        guard();
        return { ...urls, aspectRatio: validation.aspectRatio || 0.5625, duration: validation.duration ?? null };
      }), 300_000, 'Preparing the story is taking longer than expected. Retry to check its progress.');
      guard();
      const details = uploaded as typeof uploaded & { aspectRatio: number; duration: number | null };
      const payload = { requestId: activeDraft.requestId, expectedOwnerUid: session.uid, mediaUrl: uploaded.mediaUrl,
        thumbnailUrl: uploaded.thumbnailUrl, mediaType: captured.isVideo ? 'video' as const : 'image' as const,
        caption: captured.caption, isCloseFriendsOnly: captured.isCloseFriendsOnly ?? false,
        pollData: captured.pollData || undefined, aspectRatio: details.aspectRatio, duration: details.duration };
      progress('saving', 85);
      setLocked(true);
      const story = await withTimeout(activeDraft.publish(payload, () => createStory.mutateAsync({ ...payload, accountGuard: guard })),
        60_000, 'The story may have been saved. Retry this unchanged draft to confirm it.');
      guard();
      return story;
    } finally {
      reportsProgress = false;
      busyRef.current = false;
      if (mounted.current && generation.current === started) setBusy(false);
    }
  };
  return { submit, busy, locked, reset };
}
