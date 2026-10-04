import { CloseFriendsManager } from '@/components/stories/CloseFriendsManager';
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Send, Loader2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { FullscreenPortal } from '@/components/layout/FullscreenPortal';
import { useAuth } from '@/lib/auth';
import { triggerHaptic } from '@/lib/haptics';

import { useStoryComposer } from '@/hooks/useStoryComposer';
import { useReportAccountSession } from '@/hooks/useReportAccountSession';
import { resolveCaptureFile } from '@/lib/camera/resolveCaptureFile';
import { reportAccountGuard, reportAccountSnapshot, type ReportAccountSession } from '@/lib/reportModerationService';

interface CameraStoryPostSheetProps {
  mediaUrl: string;
  mediaType: 'photo' | 'video';
  mediaFile?: File;
  onClose: () => void;
  onComplete: () => void;
}

/** Streamlined story post — capture → edit → post in one flow (no extra screens). */
export function CameraStoryPostSheet(props: CameraStoryPostSheetProps) {
  const session = useReportAccountSession();
  const capturedSession = useRef(session).current;
  if (session.uid !== capturedSession.uid || session.epoch !== capturedSession.epoch) {
    return <FullscreenPortal><div role="dialog" aria-modal="true" aria-label="Capture expired" className="fixed inset-0 z-[6100] bg-black text-white flex flex-col items-center justify-center gap-4 p-6 text-center">
      <p>Your account changed. Close this capture and open the camera again.</p>
      <Button onClick={props.onClose}>Close capture</Button>
    </div></FullscreenPortal>;
  }
  return <CameraStoryPostSession key={props.mediaUrl} {...props} capturedSession={capturedSession} />;
}

function CameraStoryPostSession({
  mediaUrl,
  mediaType,
  mediaFile,
  onClose,
  onComplete,
  capturedSession,
}: CameraStoryPostSheetProps & { capturedSession: ReportAccountSession }) {
  const { user } = useAuth();
  const composer = useStoryComposer();
  const alive = useRef(false);
  const sending = useRef(false);
  const fileRef = useRef<Promise<File>>();
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [caption, setCaption] = useState('');
  const [closeFriends, setCloseFriends] = useState(false);
  const [posting, setPosting] = useState(false);

  const handlePost = async () => {
    if (sending.current) return;
    if (!user) { toast.error('Sign in to post stories'); return; }
    const ownerGuard = reportAccountGuard(user.id);
    const guard = () => {
      const current = reportAccountSnapshot();
      if (current.uid !== capturedSession.uid || current.epoch !== capturedSession.epoch) throw new Error('Your account changed. Open the camera again.');
      ownerGuard();
      if (!alive.current) throw new Error('This story editor has closed.');
    };
    sending.current = true;
    setPosting(true);
    try {
      guard();
      triggerHaptic('medium');
      fileRef.current ??= resolveCaptureFile(mediaUrl, mediaType, mediaFile).catch(error => { fileRef.current = undefined; throw error; });
      const file = await fileRef.current;
      guard();
      const story = await composer.submit({ file, isVideo: mediaType === 'video', caption, isCloseFriendsOnly: closeFriends });
      guard();
      if (!story) return;
      toast.success('Story posted!');
      onComplete();
    } catch (err) {
      try { guard(); } catch { return; }
      toast.error(err instanceof Error ? err.message : 'Failed to post story');
    } finally {
      sending.current = false;
      if (alive.current) setPosting(false);
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
            disabled={posting}
            aria-label="Close story editor"
            className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center"
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
              disabled={posting || composer.locked}
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
              <Switch disabled={posting || composer.locked} id="close-friends" checked={closeFriends} onCheckedChange={setCloseFriends} />
            </div>
            <CloseFriendsManager disabled={posting || composer.locked} className="w-full" />
          </div>
        </div>

        <div className="p-4 pb-safe">
          {composer.locked && !posting && <div className="mb-3 text-center text-sm text-white/70">
            <p>Retry keeps the same story and audience.</p>
            <Button variant="ghost" className="text-white" onClick={() => { composer.reset(); }}>Start a new story</Button>
          </div>}
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
