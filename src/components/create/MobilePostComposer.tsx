import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Send, Tag, Hash, X, Globe, Users, Lock, ChevronDown, Check, Sparkles, Image as ImageIcon, Plus, Shield, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCreatePost } from '@/hooks/usePosts';
import { useAuth } from '@/lib/auth';
import { VybeCheckFailed } from '@/components/safety/VybeCheckFailed';
import { VybeCheckOverlay } from '@/components/safety/VybeCheckOverlay';
import { type AgeRating } from '@/components/safety/AgeRatingSelector';
import { useContentSafety } from '@/hooks/useContentSafety';

import { AICaptionGenerator } from '@/components/ai/AICaptionGenerator';
import { AIPhotoEnhancer } from '@/components/ai/AIPhotoEnhancer';
import { PublishCelebration } from './PublishCelebration';
import { StyledUsername } from '@/components/ui/StyledUsername';
import { INTEREST_CATEGORIES, getSuggestedTagsForInterests, getTagCategories } from '@/lib/tagCategories';
import { Sound } from '@/hooks/useSounds';
import { toast } from 'sonner';
import { triggerHaptic } from '@/lib/haptics';
import { useComposerDraft } from '@/hooks/useComposerDraft';
import { DraftBanner } from '@/components/create/DraftBanner';

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
  const [showVybeCheck, setShowVybeCheck] = useState(false);
  const [vybeCheckFailed, setVybeCheckFailed] = useState(false);
  const [scanMessage, setScanMessage] = useState('');
  const [scanCategories, setScanCategories] = useState<string[]>([]);
  const [publishSuccess, setPublishSuccess] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [showTags, setShowTags] = useState(true);

  // Pre-scan: kick off Vybe Check as soon as media lands in composer so the
  // user instantly sees the AI working, and Share is near-instant.
  const preScan = useContentSafety();
  type PreScanState =
    | { status: 'idle' }
    | { status: 'scanning' }
    | { status: 'safe'; suggestedAgeRating?: AgeRating | null; ageRatingReasons?: string[] }
    | { status: 'blocked'; message: string; categories: string[] };
  const [preScanState, setPreScanState] = useState<PreScanState>({ status: 'idle' });
  const preScanFileRef = useRef<File | null>(null);

  useEffect(() => {
    const file = localFiles[0];
    if (!file || preScanFileRef.current === file) return;
    preScanFileRef.current = file;
    setPreScanState({ status: 'scanning' });
    let cancelled = false;
    (async () => {
      try {
        const result = file.type.startsWith('video/')
          ? await preScan.scanVideo(file)
          : await preScan.scanImage(file);
        if (cancelled) return;
        if (result.result === 'blocked') {
          setPreScanState({
            status: 'blocked',
            message: result.message || 'Content violates community guidelines',
            categories: result.categories || [],
          });
        } else {
          setPreScanState({
            status: 'safe',
            suggestedAgeRating: (result.suggestedAgeRating as AgeRating | undefined) ?? null,
            ageRatingReasons: result.ageRatingReasons,
          });
        }
      } catch {
        if (!cancelled) setPreScanState({ status: 'idle' });
      }
    })();
    return () => { cancelled = true; };
  }, [localFiles, preScan]);

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

  const canSubmit = (contentType === 'text' ? caption.trim().length > 0 : localFiles.length > 0) && tags.length > 0;
  const currentVisibility = visibilityOptions.find(v => v.id === visibility)!;

  const handleSubmit = async () => {
    if (!canSubmit || !user) return;
    if (tags.length === 0) { toast.error('Add at least one tag'); return; }
    if (localFiles.length > 0 && localFiles[0]) {
      setShowVybeCheck(true);
      return;
    }
    await doPublish('safe');
  };

  const handleVybeCheckComplete = async (ageRating: AgeRating) => {
    setShowVybeCheck(false);
    await doPublish(ageRating);
  };

  const handleVybeCheckBlocked = (message: string, categories: string[]) => {
    setShowVybeCheck(false);
    setScanMessage(message);
    setScanCategories(categories);
    setVybeCheckFailed(true);
  };

  const doPublish = async (ageRating: AgeRating) => {
    setShowCelebration(true);
    setIsUploading(true);
    setUploadProgress(0);
    const isLargeFile = localFiles[0] && localFiles[0].size > 5 * 1024 * 1024;
    const progressStep = isLargeFile ? 1 : 5;
    const progressInterval = isLargeFile ? 500 : 300;
    let pi: ReturnType<typeof setInterval> | null = null;

    try {
      pi = setInterval(() => setUploadProgress(prev => Math.min(prev + progressStep, 85)), progressInterval);
      await createPost.mutateAsync({
        mediaFile: localFiles.length <= 1 ? localFiles[0] || undefined : undefined,
        mediaFiles: localFiles.length > 1 ? localFiles : undefined,
        caption, type: contentType, tags,
        age_rating: ageRating,
      });
      if (pi) clearInterval(pi);
      setUploadProgress(100);
      setPublishSuccess(true);
      draft.clear();
      setTimeout(() => { navigate('/home'); }, 2000);
    } catch (err) {
      console.error('[Composer] Failed:', err);
      toast.error('Failed to upload');
      setShowCelebration(false);
    } finally {
      if (pi) clearInterval(pi);
      setTimeout(() => { setIsUploading(false); setUploadProgress(0); }, 1000);
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
    <div className="fixed inset-0 z-[200] flex flex-col bg-background">
      {/* Overlays */}
      <AnimatePresence>
        {showVybeCheck && (
          <VybeCheckOverlay
            files={localFiles}
            onComplete={handleVybeCheckComplete}
            onBlocked={handleVybeCheckBlocked}
            onCancel={() => setShowVybeCheck(false)}
            precomputedResult={
              preScanState.status === 'safe'
                ? {
                    blocked: false,
                    suggestedAgeRating: preScanState.suggestedAgeRating ?? null,
                    ageRatingReasons: preScanState.ageRatingReasons,
                  }
                : preScanState.status === 'blocked'
                ? {
                    blocked: true,
                    message: preScanState.message,
                    categories: preScanState.categories,
                  }
                : null
            }
          />
        )}
      </AnimatePresence>

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

      {/* Frosted Glass Header */}
      <div className="sticky top-0 z-40 backdrop-blur-xl bg-card/80 border-b border-border/30">
        {/* Aura accent line */}
        <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-primary to-transparent opacity-60" />
        <div className="flex items-center justify-between px-4 h-13">
          <button onClick={onBack} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted/50 transition-colors">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <div className="flex items-center gap-1.5">
            <motion.div
              animate={{ rotate: [0, 15, -15, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Sparkles className="w-4 h-4 text-primary" />
            </motion.div>
            <span className="text-sm font-bold text-foreground tracking-tight">Create Post</span>
          </div>
          <motion.button
            onClick={handleSubmit}
            disabled={!canSubmit || isUploading}
            whileTap={canSubmit ? { scale: 0.92 } : {}}
            className={cn(
              "h-9 px-5 rounded-full text-sm font-bold transition-all duration-300",
              canSubmit && !isUploading
                ? "bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-lg shadow-primary/30"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
          >
            {isUploading ? (
              <span className="flex items-center gap-1.5">
                <motion.span className="w-3.5 h-3.5 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground"
                  animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.6, ease: 'linear' }} />
                {uploadProgress}%
              </span>
            ) : (
              <span className="flex items-center gap-1.5"><Send className="w-3.5 h-3.5" /> Share</span>
            )}
          </motion.button>
        </div>
        {isUploading && (
          <motion.div className="h-0.5 bg-gradient-to-r from-primary via-accent to-primary" initial={{ width: '0%' }} animate={{ width: `${uploadProgress}%` }} transition={{ duration: 0.3 }} />
        )}
        {/* Live Vybe Check status — instant feedback the AI is working */}
        {hasMedia && preScanState.status !== 'idle' && (
          <div className="px-4 pb-2 pt-1.5" data-no-auto-contrast>
            <motion.div
              key={preScanState.status}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border",
                preScanState.status === 'scanning' && "border-primary/30 bg-primary/10 text-primary",
                preScanState.status === 'safe' && "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
                preScanState.status === 'blocked' && "border-red-500/30 bg-red-500/10 text-red-400",
              )}
            >
              {preScanState.status === 'scanning' && (
                <>
                  <motion.span
                    className="w-3 h-3 rounded-full border-[1.5px] border-primary/30 border-t-primary"
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 0.7, ease: 'linear' }}
                  />
                  Vybe Check scanning…
                </>
              )}
              {preScanState.status === 'safe' && (<><Shield className="w-3 h-3" /> Vybe Check passed</>)}
              {preScanState.status === 'blocked' && (<><Shield className="w-3 h-3" /> Vybe Check flagged</>)}
            </motion.div>
          </div>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
        
        {/* Immersive Media Preview */}
        {hasMedia && (
          <div className="relative">
            {localPreviews.length === 1 ? (
              <div className="relative">
                {localFiles[0]?.type.startsWith('video/') ? (
                  <video src={localPreviews[0]} className="w-full max-h-[50dvh] object-cover" controls playsInline />
                ) : (
                  <img src={localPreviews[0]} alt="" className="w-full max-h-[50dvh] object-cover" />
                )}
                {/* Gradient fade at bottom */}
                <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-background to-transparent pointer-events-none" />
                
                {/* AI Enhance floating button */}
                {!localFiles[0]?.type.startsWith('video/') && (
                  <div className="absolute top-3 right-3 z-10">
                    <AIPhotoEnhancer
                      imageFile={localFiles[0]}
                      onEnhanced={(dataUrl) => {
                        // Update preview
                        setLocalPreviews(prev => { const n = [...prev]; n[0] = dataUrl; return n; });
                        // Convert data URL to File and update files array
                        fetch(dataUrl)
                          .then(r => r.blob())
                          .then(blob => {
                            const enhanced = new File([blob], `enhanced-${Date.now()}.jpg`, { type: 'image/jpeg' });
                            setLocalFiles(prev => { const n = [...prev]; n[0] = enhanced; return n; });
                          });
                      }}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="flex gap-1.5 overflow-x-auto scrollbar-hide px-3 pt-3 pb-1">
                {localPreviews.map((p, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.04, type: 'spring', stiffness: 400, damping: 25 }}
                    className="relative w-24 h-24 rounded-2xl overflow-hidden flex-shrink-0 ring-1 ring-border/30"
                  >
                    <img src={p} alt="" className="w-full h-full object-cover" />
                    <div className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-primary/90 text-primary-foreground text-[10px] font-bold flex items-center justify-center backdrop-blur-sm">{i + 1}</div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Identity + Visibility pill row */}
        <div className="flex items-center gap-2.5 px-4 pt-3 pb-1">
          <div className="w-9 h-9 rounded-full p-[1.5px] bg-gradient-to-br from-primary via-accent to-primary flex-shrink-0">
            <div className="w-full h-full rounded-full overflow-hidden bg-card">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
                  {profile?.username?.[0]?.toUpperCase() || '?'}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {profile && <StyledUsername userId={profile.id} username={profile.username} displayName={profile.display_name} className="text-sm font-semibold" />}
            <button onClick={() => setShowVisibility(!showVisibility)}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted/60 text-muted-foreground hover:bg-muted transition-colors backdrop-blur-sm">
              <currentVisibility.icon className="w-3 h-3" /> {currentVisibility.label}
              <ChevronDown className={cn("w-2.5 h-2.5 transition-transform", showVisibility && "rotate-180")} />
            </button>
          </div>
        </div>

        {/* Visibility dropdown */}
        <AnimatePresence>
          {showVisibility && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden px-4"
            >
              <div className="flex gap-2 pb-2">
                {visibilityOptions.map(opt => (
                  <button key={opt.id} onClick={() => { setVisibility(opt.id); setShowVisibility(false); }}
                    className={cn("flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl text-[11px] font-medium transition-all border",
                      visibility === opt.id 
                        ? "border-primary/50 bg-primary/10 text-primary" 
                        : "border-border/30 text-muted-foreground hover:border-primary/30")}>
                    <opt.icon className="w-3 h-3" /> {opt.label}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Resume Draft Banner */}
        <DraftBanner
          show={!!draft.existingDraft}
          preview={draft.existingDraft?.caption}
          hadMedia={draft.existingDraft?.hadMedia}
          onResume={resumeDraft}
          onDismiss={draft.dismissExisting}
        />


        {/* Floating Caption */}
        <div className="px-4 py-2">
          <textarea
            ref={captionRef}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder={contentType === 'text' ? "What's on your mind?" : "Write a caption..."}
            className={cn(
              "w-full bg-muted/30 backdrop-blur-sm rounded-2xl px-4 py-3 text-foreground placeholder:text-muted-foreground/60 resize-none outline-none leading-relaxed border border-border/20 focus:border-primary/30 transition-colors",
              contentType === 'text' ? "text-lg min-h-[120px]" : "text-[15px] min-h-[52px]"
            )}
            maxLength={2200}
            rows={1}
          />
          <div className="flex items-center justify-between mt-1.5 px-1">
            <span className="text-[10px] text-muted-foreground/50">{caption.length}/2200</span>
          </div>
        </div>

        {/* AI Caption — gradient pill */}
        <div className="px-4 pb-3">
          <AICaptionGenerator tags={tags} contentType={contentType === 'text' ? 'post' : contentType} onSelectCaption={setCaption} />
        </div>

        {/* Tags Section — collapsible */}
        <div className="px-4 pb-4">
          <button 
            onClick={() => setShowTags(!showTags)}
            className="flex items-center justify-between w-full mb-2"
          >
            <div className="flex items-center gap-1.5">
              <Tag className={cn("w-3.5 h-3.5", tags.length > 0 ? "text-primary" : "text-destructive")} />
              <span className={cn("text-xs font-semibold", tags.length > 0 ? "text-primary" : "text-destructive")}>
                {tags.length === 0 ? 'Tags required' : `${tags.length} tag${tags.length > 1 ? 's' : ''}`}
              </span>
            </div>
            <ChevronUp className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", !showTags && "rotate-180")} />
          </button>

          {/* Active tags as gradient chips */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tags.map((tag, i) => (
                <motion.span
                  key={tag}
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: i * 0.03, type: 'spring', stiffness: 500, damping: 22 }}
                  layout
                  className="inline-flex items-center gap-1 text-xs font-semibold bg-gradient-to-r from-primary/15 to-accent/15 text-primary px-3 py-1.5 rounded-full cursor-pointer hover:from-primary/25 hover:to-accent/25 transition-all border border-primary/20"
                  onClick={() => handleRemoveTag(tag)}>
                  #{tag} <X className="w-2.5 h-2.5 opacity-60" />
                </motion.span>
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
                <div className="flex items-center gap-2 mb-2.5">
                  <div className="flex-1 relative">
                    <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
                    <input type="text" value={tagInput} onChange={(e) => setTagInput(e.target.value.replace(/\s/g, ''))} onKeyDown={handleTagInputKeyDown}
                      placeholder="Add a tag..."
                      className="w-full pl-8 pr-3 py-2.5 text-xs bg-muted/30 rounded-full border border-border/20 text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/40 transition-all backdrop-blur-sm"
                      maxLength={30} />
                  </div>
                  {tagInput.trim() && (
                    <motion.button initial={{ scale: 0 }} animate={{ scale: 1 }} onClick={() => handleAddTag(tagInput)}
                      className="h-9 px-4 rounded-full bg-gradient-to-r from-primary to-accent text-primary-foreground text-xs font-bold shadow-md shadow-primary/20">Add</motion.button>
                  )}
                </div>

                {/* Smart suggestions */}
                <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
                  {filteredSuggestions.slice(0, 8).map((s) => (
                    <button key={s.tag} onClick={() => handleAddTag(s.tag)}
                      className="flex-shrink-0 text-[11px] px-3 py-1.5 rounded-full border border-border/20 text-muted-foreground/70 hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-all font-medium backdrop-blur-sm">
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
