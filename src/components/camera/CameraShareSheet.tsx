import { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Film, Clock, MessageCircle, Download, Send, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { runPublishVybeCheck } from '@/lib/vybeCheck/runPublishVybeCheck';
import { VybeCheckFailed } from '@/components/safety/VybeCheckFailed';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { useAuth } from '@/lib/auth';
import { withTimeout } from '@/lib/withTimeout';

import { useStoryComposer } from '@/hooks/useStoryComposer';
import { useReportAccountSession } from '@/hooks/useReportAccountSession';
import { useConversations } from '@/hooks/useMessages';
import { reportAccountGuard, reportAccountSnapshot, type ReportAccountSession } from '@/lib/reportModerationService';
import { resolveCaptureFile } from '@/lib/camera/resolveCaptureFile';
import { createSnapDraft } from '@/lib/camera/snapDraft';
import { startSnapSend } from '@/lib/camera/snapSendService';
import { useNavigate } from 'react-router-dom';

interface CameraShareSheetProps {
  mediaUrl: string;
  mediaType: 'photo' | 'video';
  mediaFile?: File;
  soundId?: string;
  soundStartTime?: number;
  onClose: () => void;
  onComplete: () => void;
}

type ShareDestination = 'clip' | 'story' | 'dm' | 'save';

export function CameraShareSheet(props: CameraShareSheetProps) {
  const session = useReportAccountSession();
  const capturedSession = useRef(session).current;
  if (session.uid !== capturedSession.uid || session.epoch !== capturedSession.epoch) {
    return <div role="dialog" aria-modal="true" aria-label="Capture expired" className="fixed inset-0 z-[200] bg-black text-white flex flex-col items-center justify-center gap-4 p-6 text-center">
      <p>Your account changed. Close this capture and open the camera again.</p>
      <Button onClick={props.onClose}>Close capture</Button>
    </div>;
  }
  return <CameraShareSession key={props.mediaUrl} {...props} capturedSession={capturedSession} />;
}

function CameraShareSession({ mediaUrl, mediaType, mediaFile, soundId, soundStartTime, onClose, onComplete, capturedSession }: CameraShareSheetProps & { capturedSession: ReportAccountSession }) {
  const [selectedDestinations, setSelectedDestinations] = useState<ShareDestination[]>([]);
  const [caption, setCaption] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const [vybeCheckFailed, setVybeCheckFailed] = useState(false);
  const [scanMessage, setScanMessage] = useState('');
  const [scanCategories, setScanCategories] = useState<string[]>([]);
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const { toast } = useToast();
  const { profile, user } = useAuth();
  const profileId = useAuthProfileId();
  const effectiveProfileId = profile?.id ?? profileId;
  const composer = useStoryComposer();
  const navigate = useNavigate();
  const { data: conversations, isError: conversationsFailed } = useConversations();
  const sending = useRef(false);
  const alive = useRef(false);
  const fileRef = useRef<Promise<File>>();
  const completed = useRef(new Set<ShareDestination>());
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  useEffect(() => {
    if (isSharing) {
      document.body.setAttribute('data-story-upload-active', 'true');
    } else {
      document.body.removeAttribute('data-story-upload-active');
    }
    return () => document.body.removeAttribute('data-story-upload-active');
  }, [isSharing]);

  // Offer only conversations returned for the current account; old shared
  // recent-user caches are not a recipient directory.
  const rankedPeople = useMemo(() => conversationsFailed ? [] : (conversations || []).map(conversation => {
    const other = conversation.members?.find(member => member.profile?.id !== effectiveProfileId)?.profile;
    return { id: conversation.id, username: other?.username || 'Chat',
      display_name: conversation.is_group ? conversation.name || 'Group' : other?.display_name || other?.username || 'Chat',
      avatar_url: conversation.is_group ? conversation.avatar_url : other?.avatar_url };
  }), [conversations, conversationsFailed, effectiveProfileId]);

  const toggleDestination = (dest: ShareDestination) => {
    if (sending.current || composer.locked) return;
    if (dest === 'clip') { setSelectedDestinations(prev => prev.includes('clip') ? [] : ['clip']); return; }
    setSelectedDestinations(prev => 
      prev.includes(dest) 
        ? prev.filter(d => d !== dest)
        : [...prev.filter(item => item !== 'clip'), dest]
    );
  };

  const toggleRecipient = (userId: string) => {
    if (sending.current || composer.locked) return;
    setSelectedRecipients(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const handleShare = async () => {
    if (sending.current) return;
    if (!selectedDestinations.length) return;
    if (selectedDestinations.includes('dm') && (!selectedRecipients.length || conversationsFailed)) {
      toast({ title: 'Choose an available chat', description: 'Select who should receive this capture.', variant: 'destructive' });
      return;
    }
    const needsAccount = selectedDestinations.some(destination => destination !== 'save');
    if (needsAccount && (!user || !effectiveProfileId)) {
      toast({ title: 'Sign in required', description: 'Sign in to share this capture.', variant: 'destructive' }); return;
    }
    // Even a local download belongs to the capture's original account epoch.
    // A native Auth change can arrive before React remounts the sheet.
    const ownerGuard = needsAccount ? reportAccountGuard(user!.id) : () => {};
    const guard = () => {
      const current = reportAccountSnapshot();
      if (current.uid !== capturedSession.uid || current.epoch !== capturedSession.epoch) throw new Error('Your account changed. Open the camera again.');
      ownerGuard();
      if (!alive.current) throw new Error('This camera has closed.');
    };
    const selected = [...selectedDestinations];
    const recipients = [...selectedRecipients];
    const capturedCaption = caption.trim();
    sending.current = true;
    setIsSharing(true);
    try {
      guard();
      fileRef.current ??= resolveCaptureFile(mediaUrl, mediaType, mediaFile).catch(error => { fileRef.current = undefined; throw error; });
      const file = await fileRef.current;
      guard();
      if (selected.includes('clip')) {
        // The composer owns the explicit final publish and moderation step.
        const url = URL.createObjectURL(file);
        onComplete();
        navigate('/upload', { state: { prefillMedia: { file, url, type: mediaType }, captureTarget: 'clip',
          prefillCaption: capturedCaption, selectedSoundId: soundId, soundStartTime } });
        return;
      }
      if (selected.includes('story') && !completed.current.has('story')) {
        const story = await composer.submit({ file, isVideo: mediaType === 'video', caption: capturedCaption });
        guard();
        if (!story) return;
        completed.current.add('story');
      }
      if (selected.includes('dm') && !completed.current.has('dm')) {
        const check = await withTimeout(runPublishVybeCheck({ caption: capturedCaption, mediaFile: file, contentType: 'post' }), 180_000, 'Vybe Check timed out. Please try again.');
        guard();
        if (check.blocked || !check.allowed) {
          setScanMessage(check.message || 'Content did not pass Vybe Check');
          setScanCategories(check.categories || []);
          setVybeCheckFailed(true);
          return;
        }
        const url = URL.createObjectURL(file);
        try {
          startSnapSend({ draft: createSnapDraft({ localUri: url, mediaType, conversationIds: recipients, viewMode: 'permanent' }),
            file, senderId: effectiveProfileId!, authUserId: user!.id, caption: capturedCaption });
        } catch (error) { URL.revokeObjectURL(url); throw error; }
        completed.current.add('dm');
      }
      if (selected.includes('save') && !completed.current.has('save')) {
        guard();
        const url = URL.createObjectURL(file);
        const link = document.createElement('a');
        link.href = url; link.download = file.name;
        document.body.appendChild(link);
        try { link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60_000); }
        completed.current.add('save');
      }
      guard();
      const notices = [completed.current.has('story') ? 'Story posted.' : '', completed.current.has('dm') ? 'Messages are sending; check delivery progress.' : '',
        completed.current.has('save') ? 'Download started; check your device downloads.' : ''].filter(Boolean);
      toast({ title: 'Capture ready', description: notices.join(' ') });
      onComplete();
    } catch (error) {
      try { guard(); } catch { return; }
      toast({ title: 'Sharing needs attention', description: `${completed.current.has('story') ? 'Your story is already posted. ' : ''}${error instanceof Error ? error.message : 'Please try again.'}`, variant: 'destructive' });
    } finally {
      sending.current = false;
      if (alive.current) setIsSharing(false);
    }
  };

  const destinations = [
    { id: 'clip' as ShareDestination, icon: Film, label: 'Continue to Clip', color: 'from-pink-500 to-rose-500' },
    { id: 'story' as ShareDestination, icon: Clock, label: 'Add to Story', color: 'from-violet-500 to-purple-500' },
    { id: 'dm' as ShareDestination, icon: MessageCircle, label: 'Send to DM', color: 'from-blue-500 to-cyan-500' },
    { id: 'save' as ShareDestination, icon: Download, label: 'Save to Device', color: 'from-emerald-500 to-green-500' },
  ].filter(destination => destination.id !== 'clip' || mediaType === 'video');

  if (vybeCheckFailed) {
    return (
      <VybeCheckFailed
        message={scanMessage}
        categories={scanCategories}
        caption={caption}
        mediaUrls={[mediaUrl]}
        contentType={mediaType === 'video' ? 'short' : 'post'}
        onEdit={() => { setVybeCheckFailed(false); onClose(); }}
        onAppealComplete={() => { setVybeCheckFailed(false); onComplete(); }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[200] bg-black flex flex-col">
      {/* Header */}
      <div className="p-4 flex items-center justify-between border-b border-white/10">
        <Button variant="ghost" size="icon" onClick={onClose} disabled={isSharing} aria-label="Close sharing" className="text-white">
          <X className="h-6 w-6" />
        </Button>
        <h2 className="text-lg font-semibold text-white">Share</h2>
        <div className="w-10" />
      </div>

      {/* Media Preview */}
      <div className="flex-shrink-0 h-48 bg-black/50 flex items-center justify-center overflow-hidden">
        {mediaType === 'photo' ? (
          <img src={mediaUrl} alt="Preview" className="h-full object-contain" />
        ) : (
          <video src={mediaUrl} className="h-full object-contain" autoPlay loop muted playsInline />
        )}
      </div>

      {/* Caption */}
      <div className="p-4 border-b border-white/10">
        <Textarea
          disabled={isSharing || composer.locked}
          maxLength={2200}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Write a caption..."
          className="bg-white/5 border-white/10 text-white placeholder:text-white/40 resize-none"
          rows={3}
        />
      </div>

      {/* Share Destinations */}
      <div className="flex-1 p-4 space-y-3 overflow-y-auto">
        <p className="text-sm text-white/60 mb-4">Share to:</p>
        
        {destinations.map(dest => (
          <motion.button
            key={dest.id}
            onClick={() => toggleDestination(dest.id)}
            disabled={isSharing || composer.locked}
            aria-pressed={selectedDestinations.includes(dest.id)}
            className={cn(
              "w-full p-4 rounded-2xl flex items-center gap-4 transition-all",
              selectedDestinations.includes(dest.id)
                ? "bg-white/20 ring-2 ring-primary"
                : "bg-white/5 hover:bg-white/10"
            )}
            whileTap={{ scale: 0.98 }}
          >
            <div className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br",
              dest.color
            )}>
              <dest.icon className="h-6 w-6 text-white" />
            </div>
            <span className="text-white font-medium flex-1 text-left">{dest.label}</span>
            {selectedDestinations.includes(dest.id) && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="w-6 h-6 rounded-full bg-primary flex items-center justify-center"
              >
                <span className="text-white text-sm">✓</span>
              </motion.div>
            )}
          </motion.button>
        ))}

        {/* DM Person Picker - shows when DM is selected */}
        <AnimatePresence>
          {selectedDestinations.includes('dm') && rankedPeople.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <p className="text-xs text-white/40 mb-2 mt-1">Send to:</p>
              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
                {rankedPeople.map((person) => {
                  const isSelected = selectedRecipients.includes(person.id);
                  return (
                    <button
                      key={person.id}
                      onClick={() => toggleRecipient(person.id)}
                      disabled={isSharing || composer.locked}
                      aria-pressed={selectedRecipients.includes(person.id)}
                      className="flex flex-col items-center gap-1 flex-shrink-0 w-16"
                    >
                      <div className="relative">
                        <Avatar className={cn(
                          "h-12 w-12 border-2 transition-colors",
                          isSelected ? "border-primary" : "border-transparent"
                        )}>
                          <AvatarImage src={person.avatar_url || undefined} />
                          <AvatarFallback className="bg-white/10 text-white text-xs">
                            {(person.display_name || person.username)?.[0]?.toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        {isSelected && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center"
                          >
                            <Check className="h-3 w-3 text-white" />
                          </motion.div>
                        )}
                      </div>
                      <span className="text-[11px] text-white/70 truncate w-full text-center">
                        {person.display_name || person.username}
                      </span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {selectedDestinations.includes('dm') && !rankedPeople.length && <p className="px-4 pb-2 text-sm text-white/70">{conversationsFailed ? 'Chats could not be loaded. Reopen sharing to try again.' : 'Start a conversation in Messages to send this capture.'}</p>}
      {composer.locked && !isSharing && <p className="px-4 pb-2 text-sm text-white/70">Retry keeps this story unchanged. Already completed destinations will be skipped.</p>}
      {/* Share Button */}
      <div className="p-4 pb-safe">
        <Button 
          onClick={handleShare}
          disabled={selectedDestinations.length === 0 || isSharing}
          className="w-full gradient-animated text-white font-semibold py-6 rounded-2xl flex items-center justify-center gap-2"
        >
          {isSharing ? (
            <>
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
              />
              Preparing...
            </>
          ) : (
            <>
              <Send className="h-5 w-5" />
              {selectedDestinations.includes('clip') ? 'Continue to Clip' : 'Share Now'}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
