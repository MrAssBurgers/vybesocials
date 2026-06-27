import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Send, Loader2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { FullscreenPortal } from '@/components/layout/FullscreenPortal';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { useAuth } from '@/lib/auth';
import { useCreateStory } from '@/hooks/useStories';
import { useQueryClient } from '@tanstack/react-query';
import { triggerHaptic } from '@/lib/haptics';
import { publishStoryMedia } from '@/lib/publishStoryMedia';
import { runPublishVybeCheck } from '@/lib/vybeCheck';
import { refreshFirebaseSession } from '@/lib/firebaseAuthRefresh';
import { withTimeout } from '@/lib/withTimeout';
import { generateStoryThumbnail, validateStoryMedia } from '@/lib/storyUtils';
import { resolveStoryAuthorProfileId } from '@/lib/resolveSessionProfileId';

interface CameraStoryPostSheetProps {
  mediaUrl: string;
  mediaType: 'photo' | 'video';
  mediaFile?: File;
  onClose: () => void;
  onComplete: () => void;
}

async function resolveFile(
  mediaUrl: string,
  mediaType: 'photo' | 'video',
  mediaFile?: File,
): Promise<File> {
  if (mediaFile) return mediaFile;
  const response = await fetch(mediaUrl);
  const blob = await response.blob();
  const ext = mediaType === 'video' ? 'mp4' : 'jpg';
  const type = blob.type || (mediaType === 'video' ? 'video/mp4' : 'image/jpeg');
  return new File([blob], `story.${ext}`, { type });
}

/** Streamlined story post — capture → edit → post in one flow (no extra screens). */
export function CameraStoryPostSheet({
  mediaUrl,
  mediaType,
  mediaFile,
  onClose,
  onComplete,
}: CameraStoryPostSheetProps) {
  const { user, profile } = useAuth();
  const profileId = useAuthProfileId();
  const effectiveProfileId = profile?.id ?? profileId;
  const createStory = useCreateStory();
  const queryClient = useQueryClient();
  const [caption, setCaption] = useState('');
  const [closeFriends, setCloseFriends] = useState(false);
  const [posting, setPosting] = useState(false);

  const handlePost = async () => {
    if (!user) {
      toast.error('Sign in to post stories');
      return;
    }
    setPosting(true);
    triggerHaptic('medium');
    try {
      const file = await resolveFile(mediaUrl, mediaType, mediaFile);
      const vybe = await withTimeout(
        runPublishVybeCheck({
          caption: caption.trim(),
          mediaFile: file,
          contentType: 'story',
        }),
        180_000,
        'Vybe Check timed out',
      );
      if (vybe.blocked || !vybe.allowed) {
        throw new Error(vybe.message || 'Content violates community guidelines');
      }

      const validation = await validateStoryMedia(file);
      if (!validation.valid) {
        throw new Error(validation.error || 'Invalid story media');
      }

      await refreshFirebaseSession(8000);
      await resolveStoryAuthorProfileId(effectiveProfileId);
      const isVideo = mediaType === 'video';
      const thumbnailBlob = isVideo ? await generateStoryThumbnail(file, true) : null;

      const { mediaUrl: uploadedUrl, thumbnailUrl } = await publishStoryMedia({
        file,
        isVideo,
        thumbnailBlob,
      });

      await withTimeout(
        createStory.mutateAsync({
          mediaUrl: uploadedUrl,
          mediaType: isVideo ? 'video' : 'image',
          thumbnailUrl,
          caption: caption.trim() || undefined,
          isCloseFriendsOnly: closeFriends,
          aspectRatio: validation.aspectRatio || 0.5625,
          duration: validation.duration,
        }),
        60_000,
        'Saving story timed out. Please try again.',
      );

      void queryClient.invalidateQueries({ queryKey: ['stories'], refetchType: 'all' });
      toast.success('Story posted!');
      onComplete();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to post story';
      toast.error(msg);
    } finally {
      setPosting(false);
    }
  };

  return (
    <FullscreenPortal>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 24 }}
        className="fixed inset-0 z-[6100] bg-black flex flex-col"
      >
        <div className="flex items-center justify-between px-4 pt-safe pb-3">
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"
          >
            <X className="h-5 w-5 text-white" />
          </button>
          <span className="text-white font-semibold text-sm">Post to Story</span>
          <div className="w-10" />
        </div>

        <div className="flex-1 flex flex-col items-center px-4 min-h-0">
          <div className="relative w-full max-w-sm aspect-[9/16] rounded-2xl overflow-hidden bg-black/40 border border-white/10 shadow-2xl">
            {mediaType === 'video' ? (
              <video src={mediaUrl} className="w-full h-full object-cover" autoPlay muted loop playsInline />
            ) : (
              <img src={mediaUrl} alt="Story preview" className="w-full h-full object-cover" />
            )}
          </div>

          <div className="w-full max-w-sm mt-4 space-y-3">
            <Input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Add a caption…"
              className="bg-white/10 border-white/15 text-white placeholder:text-white/40"
              maxLength={200}
            />
            <div className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                <Label htmlFor="close-friends" className="text-sm text-white/90">
                  Close Friends only
                </Label>
              </div>
              <Switch id="close-friends" checked={closeFriends} onCheckedChange={setCloseFriends} />
            </div>
          </div>
        </div>

        <div className="p-4 pb-safe">
          <Button
            className="w-full h-12 rounded-2xl text-base font-semibold gap-2"
            disabled={posting}
            onClick={() => void handlePost()}
          >
            {posting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            {posting ? 'Posting…' : 'Share to Story'}
          </Button>
        </div>
      </motion.div>
    </FullscreenPortal>
  );
}
