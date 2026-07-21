import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Tag, Hash, X, Globe, Users, Lock, ChevronDown, Shield, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCreatePost } from '@/hooks/usePosts';
import { useAuth } from '@/lib/auth';
import { VybeCheckFailed } from '@/components/safety/VybeCheckFailed';
import { type AgeRating } from '@/components/safety/AgeRatingSelector';
import { useContentSafety } from '@/hooks/useContentSafety';

import { AICaptionGenerator } from '@/components/ai/AICaptionGenerator';
import { AIPhotoEnhancer } from '@/components/ai/AIPhotoEnhancer';
import { PublishCelebration } from './PublishCelebration';
import { StyledUsername } from '@/components/ui/StyledUsername';
import { INTEREST_CATEGORIES, getSuggestedTagsForInterests, getTagCategories } from '@/lib/tagCategories';
import { Sound } from '@/hooks/useSounds';
import { toast } from 'sonner';
import { isNativePerfMode } from '@/lib/nativePerfMode';
import { applyPostPublishNavigation } from '@/lib/postPublishNavigation';
import { triggerHaptic } from '@/lib/haptics';
import { useComposerDraft } from '@/hooks/useComposerDraft';
import { DraftBanner } from '@/components/create/DraftBanner';
import { withTimeout } from '@/lib/withTimeout';
import { enqueuePostUpload } from '@/lib/uploadQueue';
import { PersonTagPicker } from '@/features/profile/components/PersonTagPicker';
import { useTagUsersOnPost } from '@/features/profile/hooks/useTaggedPosts';

const visibilityOptions = [
  { id: 'public' as const, label: 'Everyone', icon: Globe },
  { id: 'followers' as const, label: 'Followers', icon: Users },
  { id: 'private' as const, label: 'Only me', icon: Lock },
];

interface MobilePostComposerProps {
  files: File[];
  previews: string[];
  contentType: 'text' | 'post' | 'short' | 'video';
  selectedSound?: Sound | null;
  soundStartTime?: number;
  onBack: () => void;
  onClose: () => void;
}

export function MobilePostComposer({ files: propFiles, previews: propPreviews, contentType, selectedSound, soundStartTime, onBack, onClose }: MobilePostComposerProps) {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const createPost = useCreatePost();
  const tagUsersOnPost = useTagUsersOnPost();
  const captionRef = useRef<HTMLTextAreaElement>(null);

  // Local state mirrors so filters/enhancements can mutate what gets uploaded
  const [localFiles, setLocalFiles] = useState<File[]>(propFiles);
  const [localPreviews, setLocalPreviews] = useState<string[]>(propPreviews);

  const [caption, setCaption] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [visibility, setVisibility] = useState<'public' | 'followers' | 'private'>('public');
  const [showVisibility, setShowVisibility] = useState(false);
  const [vybeCheckFailed, setVybeCheckFailed] = useState(false);
  const [scanMessage, setScanMessage] = useState('');
  const [scanCategories, setScanCategories] = useState<string[]>([]);
  const [publishSuccess, setPublishSuccess] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [showTags, setShowTags] = useState(true);
  const [taggedUserIds, setTaggedUserIds] = useState<string[]>([]);

  // Pre-scan: kick off Vybe Check as soon as media lands in composer so the
  // user instantly sees the AI working, and Share is near-instant.
  const preScan = useContentSafety();
  type PreScanState =
    | { status: 'idle' }
    | { status: 'scanning' }
    | { status: 'safe'; suggestedAgeRating?: AgeRating | null; ageRatingReasons?: string[] }
    | { status: 'blocked'; message: string; categories: string[] }
    | { status: 'error'; message: string };
  const [preScanState, setPreScanState] = useState<PreScanState>({ status: 'idle' });
  const preScanFileRef = useRef<File | null>(null);

  const runPreScan = useCallback(async (file: File) => {
    setPreScanState({ status: 'scanning' });
    try {
      const result = file.type.startsWith('video/')
        ? await withTimeout(preScan.scanVideo(file), 45000, 'Vybe Check timed out')
        : await withTimeout(preScan.scanImage(file), 45000, 'Vybe Check timed out');
      if (preScanFileRef.current !== file) return;
      if (result.result === 'blocked') {
        setPreScanState({
          status: 'blocked',
          message: result.message || 'Content violates community guidelines',
          categories: result.categories || [],
        });
      } else if (result.result === 'error') {
        setPreScanState({
          status: 'error',
          message: result.message || 'Vybe Check failed. Try again before sharing.',
        });
        toast.error(result.message || 'Vybe Check failed. Try again before sharing.');
      } else {
        setPreScanState({
          status: 'safe',
          suggestedAgeRating: (result.suggestedAgeRating as AgeRating | undefined) ?? null,
          ageRatingReasons: result.ageRatingReasons,
        });
      }
    } catch (err) {
      if (preScanFileRef.current !== file) return;
      const message = err instanceof Error ? err.message : 'Vybe Check failed';
      setPreScanState({ status: 'error', message });
      toast.error(message);
    }
  }, [preScan]);

  useEffect(() => {
    const file = localFiles[0];
    if (!file || preScanFileRef.current === file) return;
    preScanFileRef.current = file;
    void runPreScan(file);
  }, [localFiles, runPreScan]);

  // Draft persistence — survives accidental swipe-outs
  const draft = useComposerDraft(contentType === 'short' ? 'short' : contentType === 'video' ? 'video' : 'post');
  useEffect(() => {
    draft.stage({ caption, tags, visibility, hadMedia: localFiles.length > 0 });
  }, [caption, tags, visibility, localFiles.length, draft]);

  const resumeDraft = useCallback(() => {
    const d = draft.existingDraft;
    if (!d) return;
    if (d.caption) setCaption(d.caption);
    if (d.tags) setTags(d.tags);
    if (d.visibility) setVisibility(d.visibility as 'public' | 'followers' | 'private');
    draft.dismissExisting();
    triggerHaptic('light');
  }, [draft]);

  // Sync from props if they change (e.g. parent re-captures)
  useEffect(() => { setLocalFiles(propFiles); }, [propFiles]);
  useEffect(() => { setLocalPreviews(propPreviews); }, [propPreviews]);

  useEffect(() => {
    const el = captionRef.current;
    if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 200) + 'px'; }
  }, [caption]);

  useEffect(() => {
    setTimeout(() => captionRef.current?.focus(), 300);
  }, []);

  const handleAddTag = (tag: string) => {
    const c = tag.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
    if (c && !tags.includes(c) && tags.length < 10) { setTags([...tags, c]); setTagInput(''); triggerHaptic('light'); }
  };
  const handleRemoveTag = (t: string) => setTags(tags.filter(tag => tag !== t));
  const handleTagInputKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); handleAddTag(tagInput); } };

  const smartSuggestions = useMemo(() => {
    const userInterests = (profile as any)?.interests || [];
    if (userInterests.length === 0) {
      return INTEREST_CATEGORIES.slice(0, 6).flatMap(cat =>
        cat.tags.slice(0, 2).map(tag => ({ tag, emoji: cat.emoji, category: cat.id }))
      );
    }
    return getSuggestedTagsForInterests(userInterests);
  }, [profile]);

  const filteredSuggestions = useMemo(() => smartSuggestions.filter(s => !tags.includes(s.tag)), [smartSuggestions, tags]);

  // Tags are optional — only media or caption is required.
  const canSubmit = contentType === 'text' ? caption.trim().length > 0 : localFiles.length > 0;
  const hasPendingMedia = localFiles.length > 0;
  const shareBlockedByVybe =
    hasPendingMedia &&
    (preScanState.status === 'scanning' ||
      preScanState.status === 'blocked' ||
      preScanState.status === 'error' ||
      preScanState.status === 'idle');
  const currentVisibility = visibilityOptions.find(v => v.id === visibility)!;

  useEffect(() => {
    const onUploadFailed = (e: Event) => {
      const detail = (e as CustomEvent<{ reason?: string }>).detail;
      const reason = detail?.reason || '';
      if (!reason.toLowerCase().includes('vybe check')) return;
      setScanMessage(reason);
      setScanCategories(['vybe_check']);
      setVybeCheckFailed(true);
    };
    window.addEventListener('vybe:upload-failed', onUploadFailed);
    return () => window.removeEventListener('vybe:upload-failed', onUploadFailed);
  }, []);

  const handleSubmit = async () => {
    if (!user) {
      toast.error('Please sign in to post');
      return;
    }
    if (!canSubmit) {
      toast.error(contentType === 'text' ? 'Write something first' : 'Add a photo or video first');
      return;
    }
    if (hasPendingMedia && preScanState.status === 'scanning') {
      toast.message('Vybe Check is still running…');
      return;
    }
    if (hasPendingMedia && preScanState.status === 'error') {
      toast.error(preScanState.message || 'Vybe Check failed — tap retry first');
      return;
    }
    if (preScanState.status === 'blocked') {
      setScanMessage(preScanState.message);
      setScanCategories(preScanState.categories);
      setVybeCheckFailed(true);
      return;
    }
    if (hasPendingMedia && preScanState.status !== 'safe') {
      toast.error('Wait for Vybe Check to finish before sharing');
      return;
    }
    if (localFiles.length > 0) {
      if (!profile?.id || !profile?.user_id) {
        toast.error('Please sign in again to post');
        return;
      }
      enqueuePostUpload(
        {
          profile: { id: profile.id, user_id: profile.user_id },
          mediaFile: localFiles.length <= 1 ? localFiles[0] : undefined,
          mediaFiles: localFiles.length > 1 ? localFiles : undefined,
          caption,
          tags,
          type: contentType,
        },
        caption.trim().slice(0, 48) || 'New post',
      );
      draft.clear();
      triggerHaptic('success');
      toast.success('Publishing in background — Vybe Check complete.');
      onClose();
      navigate(applyPostPublishNavigation(contentType));
      return;
    }
    await doPublish(
      preScanState.status === 'safe' && preScanState.suggestedAgeRating
        ? preScanState.suggestedAgeRating
        : 'safe',
    );
  };

  const doPublish = async (ageRating: AgeRating) => {
    setShowCelebration(true);
    setIsUploading(true);
    setUploadProgress(0);
    const isLargeFile = localFiles[0] && localFiles[0].size > 5 * 1024 * 1024;
    const progressStep = isLargeFile ? 1 : 5;
    const progressInterval = isLargeFile ? 500 : 300;
    let pi: ReturnType<typeof setInterval> | null = null;
    let succeeded = false;

    try {
      pi = setInterval(() => setUploadProgress(prev => Math.min(prev + progressStep, 85)), progressInterval);

      const post = await withTimeout(
        createPost.mutateAsync({
          mediaFile: localFiles.length <= 1 ? localFiles[0] || undefined : undefined,
          mediaFiles: localFiles.length > 1 ? localFiles : undefined,
          caption, type: contentType, tags,
          age_rating: ageRating,
        }),
        180000,
        'Upload timed out. Check your connection and try again.',
      );
      if (taggedUserIds.length && (post as { id?: string } | null)?.id) {
        try {
          await tagUsersOnPost.mutateAsync({
            postId: String((post as { id: string }).id),
            taggedUserIds,
          });
        } catch (tagErr) {
          console.warn('[Composer] Person tags failed:', tagErr);
        }
      }
      if (pi) clearInterval(pi);
      setUploadProgress(100);
      setPublishSuccess(true);
      succeeded = true;
      draft.clear();
      const dest = applyPostPublishNavigation(contentType);
      const delayMs = isNativePerfMode() ? 900 : 2000;
      setTimeout(() => { navigate(dest); }, delayMs);
    } catch (err: any) {
      console.error('[Composer] Failed:', err);
      const msg =
        err?.message ||
        err?.error_description ||
        (typeof err === 'string' ? err : 'Failed to upload — please try again');
      toast.error(msg.includes('timed out') ? msg : msg || 'Failed to upload. Please try again.');
      setShowCelebration(false);
      setPublishSuccess(false);
      setIsUploading(false);
      setUploadProgress(0);
    } finally {
      if (pi) clearInterval(pi);
      if (!succeeded) {
        setShowCelebration(false);
        setIsUploading(false);
        setUploadProgress(0);
      }
    }
  };

  if (vybeCheckFailed) {
    return (
      <VybeCheckFailed
        message={scanMessage}
        categories={scanCategories}
        caption={caption}
        tags={tags}
        mediaUrls={localPreviews}
        contentType={contentType}
        onEdit={() => { setVybeCheckFailed(false); }}
        onAppealComplete={() => { setVybeCheckFailed(false); onClose(); }}
      />
    );
  }

  const hasMedia = localPreviews.length > 0;

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-[#09090b]">
      {/* Overlays */}
      <AnimatePresence>
        {showCelebration && (
          <PublishCelebration
            isUploading={isUploading}
            progress={uploadProgress}
            isComplete={publishSuccess}
            onViewPost={() => navigate('/home')}
          />
        )}
      </AnimatePresence>

      {/* Studio header */}
      <div
        className="sticky top-0 z-40 border-b border-white/10 bg-[#09090b]/95 backdrop-blur-md"
        style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top, 0px))' }}
      >
        <div className="flex h-12 items-center justify-between px-3">
          <button
            type="button"
            onClick={onBack}
            className="flex h-10 w-10 items-center justify-center rounded-full text-white/80 hover:bg-white/10"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold tracking-tight text-white">New post</span>
          <motion.button
            type="button"
            onClick={handleSubmit}
            disabled={isUploading || !canSubmit || shareBlockedByVybe}
            whileTap={!isUploading && canSubmit && !shareBlockedByVybe ? { scale: 0.94 } : {}}
            className={cn(
              'h-9 rounded-full px-4 text-sm font-bold transition-colors',
              canSubmit && !isUploading && !shareBlockedByVybe
                ? 'bg-white text-black'
                : 'bg-white/10 text-white/35',
            )}
          >
            {isUploading ? (
              <span className="flex items-center gap-1.5">
                <motion.span
                  className="h-3.5 w-3.5 rounded-full border-2 border-black/20 border-t-black"
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 0.6, ease: 'linear' }}
                />
                {uploadProgress}%
              </span>
            ) : preScanState.status === 'scanning' ? (
              'Checking…'
            ) : (
              'Publish'
            )}
          </motion.button>
        </div>
        {isUploading && (
          <motion.div
            className="h-0.5 bg-white"
            initial={{ width: '0%' }}
            animate={{ width: `${uploadProgress}%` }}
            transition={{ duration: 0.3 }}
          />
        )}
        {hasMedia && (
          <div className="flex items-center gap-2 px-4 pb-2.5 pt-0.5" data-no-auto-contrast>
            <div
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold',
                preScanState.status === 'scanning' && 'border-white/20 bg-white/10 text-white/85',
                preScanState.status === 'safe' && 'border-emerald-500/35 bg-emerald-500/15 text-emerald-300',
                preScanState.status === 'blocked' && 'border-red-500/35 bg-red-500/15 text-red-300',
                preScanState.status === 'error' && 'border-amber-500/35 bg-amber-500/15 text-amber-200',
                preScanState.status === 'idle' && 'border-white/15 bg-white/5 text-white/50',
              )}
            >
              {preScanState.status === 'scanning' && (
                <>
                  <motion.span
                    className="h-3 w-3 rounded-full border-[1.5px] border-white/25 border-t-white"
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 0.7, ease: 'linear' }}
                  />
                  Checking safety…
                </>
              )}
              {preScanState.status === 'safe' && (
                <>
                  <Shield className="h-3 w-3" /> Ready to publish
                </>
              )}
              {preScanState.status === 'blocked' && (
                <>
                  <Shield className="h-3 w-3" /> Vybe Check flagged
                </>
              )}
              {preScanState.status === 'error' && (
                <>
                  <Shield className="h-3 w-3" /> Check failed
                </>
              )}
              {preScanState.status === 'idle' && (
                <>
                  <Shield className="h-3 w-3" /> Preparing check…
                </>
              )}
            </div>
            {preScanState.status === 'error' && localFiles[0] && (
              <button
                type="button"
                className="text-[11px] font-semibold text-white/70 underline underline-offset-2"
                onClick={() => void runPreScan(localFiles[0])}
              >
                Retry
              </button>
            )}
          </div>
        )}
      </div>

      {/* Scrollable studio body */}
      <div className="flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
        {/* Media preview card */}
        {hasMedia && (
          <div className="px-3 pt-3">
            {localPreviews.length === 1 ? (
              <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black">
                {localFiles[0]?.type.startsWith('video/') ? (
                  <video src={localPreviews[0]} className="max-h-[42dvh] w-full object-contain" controls playsInline />
                ) : (
                  <img src={localPreviews[0]} alt="" className="max-h-[42dvh] w-full object-contain" />
                )}
                {!localFiles[0]?.type.startsWith('video/') && (
                  <div className="absolute right-2 top-2 z-10">
                    <AIPhotoEnhancer
                      imageFile={localFiles[0]}
                      onEnhanced={(dataUrl) => {
                        setLocalPreviews((prev) => {
                          const n = [...prev];
                          n[0] = dataUrl;
                          return n;
                        });
                        fetch(dataUrl)
                          .then((r) => r.blob())
                          .then((blob) => {
                            const enhanced = new File([blob], `enhanced-${Date.now()}.jpg`, {
                              type: 'image/jpeg',
                            });
                            setLocalFiles((prev) => {
                              const n = [...prev];
                              n[0] = enhanced;
                              return n;
                            });
                          });
                      }}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
                {localPreviews.map((p, i) => (
                  <div
                    key={i}
                    className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-xl border border-white/10"
                  >
                    <img src={p} alt="" className="h-full w-full object-cover" />
                    <div className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-bold text-black">
                      {i + 1}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Identity + audience */}
        <div className="flex items-center gap-2.5 px-4 pb-1 pt-4">
          <div className="h-9 w-9 flex-shrink-0 overflow-hidden rounded-full border border-white/15 bg-white/10">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs font-bold text-white/50">
                {profile?.username?.[0]?.toUpperCase() || '?'}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {profile && (
              <StyledUsername
                userId={profile.id}
                username={profile.username}
                displayName={profile.display_name}
                className="text-sm font-semibold text-white"
              />
            )}
            <button
              type="button"
              onClick={() => setShowVisibility(!showVisibility)}
              className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white/70"
            >
              <currentVisibility.icon className="h-3 w-3" /> {currentVisibility.label}
              <ChevronDown className={cn('h-2.5 w-2.5 transition-transform', showVisibility && 'rotate-180')} />
            </button>
          </div>
        </div>

        <AnimatePresence>
          {showVisibility && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden px-4"
            >
              <div className="flex gap-2 pb-2">
                {visibilityOptions.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setVisibility(opt.id);
                      setShowVisibility(false);
                    }}
                    className={cn(
                      'flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-[11px] font-medium transition-all',
                      visibility === opt.id
                        ? 'border-white/40 bg-white/15 text-white'
                        : 'border-white/10 text-white/50',
                    )}
                  >
                    <opt.icon className="h-3 w-3" /> {opt.label}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <DraftBanner
          show={!!draft.existingDraft}
          preview={draft.existingDraft?.caption}
          hadMedia={draft.existingDraft?.hadMedia}
          onResume={resumeDraft}
          onDismiss={draft.dismissExisting}
        />

        <div className="px-4 py-2">
          <textarea
            ref={captionRef}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder={contentType === 'text' ? "What's on your mind?" : 'Write a caption…'}
            className={cn(
              'w-full resize-none rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-white outline-none placeholder:text-white/35 focus:border-white/25',
              contentType === 'text' ? 'min-h-[120px] text-lg' : 'min-h-[52px] text-[15px]',
            )}
            maxLength={2200}
            rows={1}
          />
          <div className="mt-1.5 flex items-center justify-between px-1">
            <span className="text-[10px] text-white/35">{caption.length}/2200</span>
          </div>
        </div>

        <div className="px-4 pb-3">
          <AICaptionGenerator
            tags={tags}
            contentType={contentType === 'text' ? 'post' : contentType}
            onSelectCaption={setCaption}
          />
        </div>

        <div className="space-y-3 px-4 pb-8">
          <PersonTagPicker selectedIds={taggedUserIds} onChange={setTaggedUserIds} />
          <button type="button" onClick={() => setShowTags(!showTags)} className="mb-2 flex w-full items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Tag className={cn('h-3.5 w-3.5', tags.length > 0 ? 'text-white' : 'text-white/45')} />
              <span className={cn('text-xs font-semibold', tags.length > 0 ? 'text-white' : 'text-white/45')}>
                {tags.length === 0 ? 'Tags (optional)' : `${tags.length} tag${tags.length > 1 ? 's' : ''}`}
              </span>
            </div>
            <ChevronUp className={cn('h-3.5 w-3.5 text-white/40 transition-transform', !showTags && 'rotate-180')} />
          </button>

          {tags.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white"
                  onClick={() => handleRemoveTag(tag)}
                >
                  #{tag} <X className="h-2.5 w-2.5 opacity-60" />
                </button>
              ))}
            </div>
          )}

          <AnimatePresence>
            {showTags && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="mb-2.5 flex items-center gap-2">
                  <div className="relative flex-1">
                    <Hash className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" />
                    <input
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value.replace(/\s/g, ''))}
                      onKeyDown={handleTagInputKeyDown}
                      placeholder="Add a tag…"
                      className="w-full rounded-full border border-white/10 bg-white/[0.06] py-2.5 pl-8 pr-3 text-xs text-white outline-none placeholder:text-white/35 focus:border-white/25"
                      maxLength={30}
                    />
                  </div>
                  {tagInput.trim() && (
                    <button
                      type="button"
                      onClick={() => handleAddTag(tagInput)}
                      className="h-9 rounded-full bg-white px-4 text-xs font-bold text-black"
                    >
                      Add
                    </button>
                  )}
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
                  {filteredSuggestions.slice(0, 8).map((s) => (
                    <button
                      key={s.tag}
                      type="button"
                      onClick={() => handleAddTag(s.tag)}
                      className="flex-shrink-0 rounded-full border border-white/10 px-3 py-1.5 text-[11px] font-medium text-white/55"
                    >
                      {s.emoji} #{s.tag}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
