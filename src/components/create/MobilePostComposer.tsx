import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Send, Tag, Hash, X, Globe, Users, Lock, ChevronDown, Check, Sparkles, Image as ImageIcon, Plus, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCreatePost } from '@/hooks/usePosts';
import { useAuth } from '@/lib/auth';
import { VybeCheckFailed } from '@/components/safety/VybeCheckFailed';
import { VybeCheckOverlay } from '@/components/safety/VybeCheckOverlay';
import { type AgeRating } from '@/components/safety/AgeRatingSelector';
import { AICaptionGenerator } from '@/components/ai/AICaptionGenerator';
import { AIPhotoEnhancer } from '@/components/ai/AIPhotoEnhancer';
import { PublishCelebration } from './PublishCelebration';
import { StyledUsername } from '@/components/ui/StyledUsername';
import { INTEREST_CATEGORIES, getSuggestedTagsForInterests, getTagCategories } from '@/lib/tagCategories';
import { Sound } from '@/hooks/useSounds';
import { toast } from 'sonner';
import { triggerHaptic } from '@/lib/haptics';

const visibilityOptions = [
  { id: 'public' as const, label: 'Everyone', icon: Globe, description: 'Visible to all' },
  { id: 'followers' as const, label: 'Followers', icon: Users, description: 'Only followers' },
  { id: 'private' as const, label: 'Only me', icon: Lock, description: 'Private post' },
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

export function MobilePostComposer({ files, previews, contentType, selectedSound, soundStartTime, onBack, onClose }: MobilePostComposerProps) {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const createPost = useCreatePost();
  const captionRef = useRef<HTMLTextAreaElement>(null);

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
  const [publishAnimation, setPublishAnimation] = useState(false);

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

  const canSubmit = (contentType === 'text' ? caption.trim().length > 0 : files.length > 0) && tags.length > 0;
  const currentVisibility = visibilityOptions.find(v => v.id === visibility)!;

  const handleSubmit = async () => {
    if (!canSubmit || !user) return;
    if (tags.length === 0) { toast.error('Add at least one tag'); return; }

    // Run AI safety scan at post time
    if (files.length > 0 && files[0]) {
      setShowCelebration(true);
      setIsUploading(true);
      setUploadProgress(0);
      setShowSafetyScanner(true);

      let scanResult;
      if (files[0].type.startsWith('video/')) {
        scanResult = await contentSafety.scanVideo(files[0]);
      } else {
        scanResult = await contentSafety.scanImage(files[0]);
      }

      setShowSafetyScanner(false);

      if (scanResult.result === 'blocked') {
        setIsUploading(false);
        setShowCelebration(false);
        setScanMessage(scanResult.message || 'Content violates community guidelines');
        setScanCategories(scanResult.categories || []);
        setVybeCheckFailed(true);
        return;
      }
    }

    setShowCelebration(true);
    setIsUploading(true);
    setUploadProgress(0);
    const isLargeFile = files[0] && files[0].size > 5 * 1024 * 1024;
    const progressStep = isLargeFile ? 1 : 5;
    const progressInterval = isLargeFile ? 500 : 300;
    let pi: ReturnType<typeof setInterval> | null = null;

    try {
      pi = setInterval(() => setUploadProgress(prev => Math.min(prev + progressStep, 85)), progressInterval);
      await createPost.mutateAsync({
        mediaFile: files.length <= 1 ? files[0] || undefined : undefined,
        mediaFiles: files.length > 1 ? files : undefined,
        caption, type: contentType, tags,
      });
      if (pi) clearInterval(pi);
      setUploadProgress(100);
      setPublishSuccess(true);
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

  // Vybe Check Failed overlay
  if (vybeCheckFailed) {
    return (
      <VybeCheckFailed
        message={scanMessage}
        categories={scanCategories}
        caption={caption}
        tags={tags}
        mediaUrls={previews}
        contentType={contentType}
        onEdit={() => { setVybeCheckFailed(false); }}
        onAppealComplete={() => { setVybeCheckFailed(false); onClose(); }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[200] flex flex-col" style={{ backgroundColor: 'hsl(var(--background))' }}>
      {/* Safety scan overlay */}
      <AnimatePresence>
        {showSafetyScanner && contentSafety.isScanning && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[260] flex items-center justify-center bg-background/95 backdrop-blur-sm"
          >
            <div className="w-80 space-y-6 text-center">
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
                <Shield className="h-8 w-8 text-primary" />
              </motion.div>
              <div>
                <p className="text-foreground font-bold text-lg mb-1">Vybe Check</p>
                <p className="text-muted-foreground text-sm">{contentSafety.message || 'Scanning your content...'}</p>
              </div>
              <SafetyScanProgress phase={contentSafety.scanPhase} isVideo={files[0]?.type.startsWith('video/')} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Publish Celebration — Full screen overlay */}
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

      {/* Header */}
      <div className="sticky top-0 z-40 border-b border-border" style={{ backgroundColor: 'hsl(var(--card))' }}>
        <div className="flex items-center justify-between px-4 h-14">
          <button onClick={onBack} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-base font-bold text-foreground">Create</span>
          </div>
          <motion.button
            onClick={handleSubmit}
            disabled={!canSubmit || isUploading}
            whileTap={canSubmit ? { scale: 0.92 } : {}}
            className={cn(
              "h-9 px-5 rounded-full text-sm font-bold transition-all duration-200",
              canSubmit && !isUploading
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
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
          <motion.div className="h-0.5 bg-primary" initial={{ width: '0%' }} animate={{ width: `${uploadProgress}%` }} transition={{ duration: 0.3 }} />
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
        {/* Card-style media preview */}
        {previews.length > 0 && (
          <div className="px-4 pt-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative rounded-3xl overflow-hidden shadow-2xl shadow-primary/10 border border-border"
              style={{ backgroundColor: 'hsl(var(--muted))' }}
            >
              {previews.length === 1 ? (
                <>
                  {files[0]?.type.startsWith('video/') ? (
                    <video src={previews[0]} className="w-full max-h-[45dvh] object-contain mx-auto" controls playsInline />
                  ) : (
                    <img src={previews[0]} alt="" className="w-full max-h-[45dvh] object-contain mx-auto" />
                  )}
                  {/* AI Photo Enhancer */}
                  {!files[0]?.type.startsWith('video/') && (
                    <div className="absolute bottom-3 right-3 z-10">
                      <AIPhotoEnhancer
                        imageFile={files[0]}
                        onEnhanced={(dataUrl) => {
                          const newPreviews = [...previews];
                          newPreviews[0] = dataUrl;
                        }}
                      />
                    </div>
                  )}
                  {/* Floating caption overlay hint */}
                  {!caption && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.5 }}
                      className="absolute bottom-14 left-4 right-4 pointer-events-none"
                    >
                      <div className="px-4 py-2 rounded-xl bg-black/30 backdrop-blur-sm">
                        <span className="text-white/50 text-sm">Tap below to add a caption...</span>
                      </div>
                    </motion.div>
                  )}
                </>
              ) : (
                <div className="flex gap-2 overflow-x-auto scrollbar-hide p-3">
                  {previews.map((p, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.05 }}
                      className="relative w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 border border-border"
                    >
                      <img src={p} alt="" className="w-full h-full object-cover" />
                      <div className="absolute top-1 left-1 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">{i + 1}</div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          </div>
        )}

        {/* User row */}
        <div className="flex items-center gap-3 px-4 pt-3 pb-2">
          <div className="w-10 h-10 rounded-full p-[2px] bg-gradient-to-br from-primary via-accent to-primary flex-shrink-0">
            <div className="w-full h-full rounded-full overflow-hidden bg-card">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground">
                  {profile?.username?.[0]?.toUpperCase() || '?'}
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-0.5">
            {profile && <StyledUsername userId={profile.id} username={profile.username} displayName={profile.display_name} className="text-sm font-bold" />}
            <button onClick={() => setShowVisibility(!showVisibility)}
              className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-muted text-muted-foreground hover:bg-accent transition-colors">
              <currentVisibility.icon className="w-3 h-3" /> {currentVisibility.label}
              <ChevronDown className={cn("w-3 h-3 transition-transform", showVisibility && "rotate-180")} />
            </button>
          </div>
        </div>

        {/* Caption */}
        <div className="px-4 pb-2">
          <textarea
            ref={captionRef}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder={contentType === 'text' ? "What's on your mind?" : "Write a caption..."}
            className={cn("w-full bg-transparent text-foreground placeholder:text-muted-foreground resize-none outline-none leading-relaxed",
              contentType === 'text' ? "text-lg min-h-[100px]" : "text-[15px] min-h-[44px]"
            )}
            maxLength={2200}
            rows={1}
          />
        </div>

        {/* Tags with stagger animation */}
        <div className="px-4 pb-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Tag className={cn("w-3.5 h-3.5", tags.length > 0 ? "text-primary" : "text-destructive")} />
            <span className={cn("text-xs font-medium", tags.length > 0 ? "text-primary" : "text-destructive")}>
              {tags.length === 0 ? 'Add at least 1 tag (required)' : `${tags.length} tag${tags.length > 1 ? 's' : ''}`}
            </span>
          </div>

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tags.map((tag, i) => (
                <motion.span
                  key={tag}
                  initial={{ scale: 0.5, opacity: 0, y: 10 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05, type: 'spring', stiffness: 400, damping: 20 }}
                  layout
                  className="inline-flex items-center gap-1 text-xs text-primary bg-primary/10 px-2.5 py-1 rounded-full font-medium cursor-pointer hover:bg-primary/20 transition-colors"
                  onClick={() => handleRemoveTag(tag)}>
                  #{tag} <X className="w-2.5 h-2.5" />
                </motion.span>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 mb-2">
            <div className="flex-1 relative">
              <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input type="text" value={tagInput} onChange={(e) => setTagInput(e.target.value.replace(/\s/g, ''))} onKeyDown={handleTagInputKeyDown}
                placeholder="Add a tag..." className="w-full pl-8 pr-3 py-2 text-xs bg-muted/50 rounded-full border border-border/50 text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 transition-all" maxLength={30} />
            </div>
            {tagInput.trim() && (
              <motion.button initial={{ scale: 0 }} animate={{ scale: 1 }} onClick={() => handleAddTag(tagInput)}
                className="h-8 px-3 rounded-full bg-primary text-primary-foreground text-xs font-semibold">Add</motion.button>
            )}
          </div>

          {/* Suggestions */}
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
            {filteredSuggestions.slice(0, 8).map((s) => (
              <button key={s.tag} onClick={() => handleAddTag(s.tag)}
                className="flex-shrink-0 text-[11px] px-3 py-1 rounded-full border border-border/50 text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-all font-medium">
                #{s.tag}
              </button>
            ))}
          </div>
        </div>

        {/* AI Caption */}
        <div className="px-4 pb-4 border-t border-border/30 pt-3">
          <AICaptionGenerator tags={tags} contentType={contentType === 'text' ? 'post' : contentType} onSelectCaption={setCaption} />
        </div>
      </div>
    </div>
  );
}
