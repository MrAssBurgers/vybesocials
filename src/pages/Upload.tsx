import { useState, useCallback, useRef, useEffect, DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Camera } from '@/components/camera/Camera';
import { ContentSafetyScanner } from '@/components/safety/ContentSafetyScanner';
import { AICaptionGenerator } from '@/components/ai/AICaptionGenerator';
import { AIVideoGenerator } from '@/components/ai/AIVideoGenerator';
import { useCreatePost } from '@/hooks/usePosts';
import { useContentSafety } from '@/hooks/useContentSafety';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { StyledUsername } from '@/components/ui/StyledUsername';
import {
  Image, Video, Film, X, Plus, Camera as CameraIcon,
  Upload as UploadIcon, Wand2, ImagePlus, ArrowLeft, Type,
  Hash, Send, Globe, Users, Lock, ChevronDown,
  Sparkles, Check
} from 'lucide-react';
import { useIsMobileOrTablet } from '@/hooks/use-mobile';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

const suggestedTags = ['photography', 'art', 'music', 'gaming', 'food', 'travel', 'fashion', 'fitness', 'ai', 'vybe'];

const visibilityOptions = [
  { id: 'public', label: 'Everyone', icon: Globe, description: 'Visible to all' },
  { id: 'followers', label: 'Followers', icon: Users, description: 'Only followers' },
  { id: 'private', label: 'Only me', icon: Lock, description: 'Private post' },
] as const;

const contentTypes = [
  { id: 'text' as const, icon: Type, label: 'Text' },
  { id: 'post' as const, icon: Image, label: 'Photo' },
  { id: 'short' as const, icon: Film, label: 'Clip' },
  { id: 'video' as const, icon: Video, label: 'Video' },
];

export default function UploadPage() {
  const { isMobileOrTablet } = useIsMobileOrTablet();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const createPost = useCreatePost();
  const contentSafety = useContentSafety();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const captionRef = useRef<HTMLTextAreaElement>(null);

  const [contentType, setContentType] = useState<'text' | 'post' | 'short' | 'video'>('post');
  const [file, setFile] = useState<File | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [caption, setCaption] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [showSafetyScanner, setShowSafetyScanner] = useState(false);
  const [showAIVideoGenerator, setShowAIVideoGenerator] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showVisibility, setShowVisibility] = useState(false);
  const [visibility, setVisibility] = useState<'public' | 'followers' | 'private'>('public');
  const [publishSuccess, setPublishSuccess] = useState(false);

  // Long-form video
  const [videoTitle, setVideoTitle] = useState('');
  const [videoDescription, setVideoDescription] = useState('');
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [generatedThumbnails, setGeneratedThumbnails] = useState<string[]>([]);
  const [selectedThumbnailIndex, setSelectedThumbnailIndex] = useState<number | null>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);

  // Auto-resize caption
  useEffect(() => {
    const el = captionRef.current;
    if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 240) + 'px'; }
  }, [caption]);

  // Auto-focus on mount
  useEffect(() => {
    const timer = setTimeout(() => captionRef.current?.focus(), 300);
    return () => clearTimeout(timer);
  }, []);

  const generateThumbnailsFromVideo = useCallback((videoFile: File) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous'; video.muted = true; video.preload = 'metadata';
    const captureFrame = (time: number): Promise<string> => new Promise((resolve) => {
      video.currentTime = time;
      video.onseeked = () => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 1280; canvas.height = video.videoHeight || 720;
        const ctx = canvas.getContext('2d');
        if (ctx) { ctx.drawImage(video, 0, 0, canvas.width, canvas.height); resolve(canvas.toDataURL('image/jpeg', 0.85)); }
        else resolve('');
      };
    });
    video.onloadedmetadata = async () => {
      const d = video.duration;
      const thumbnails: string[] = [];
      for (const t of [d * 0.1, d * 0.25, d * 0.5, d * 0.75]) { const thumb = await captureFrame(t); if (thumb) thumbnails.push(thumb); }
      setGeneratedThumbnails(thumbnails);
      if (thumbnails.length > 0) { setSelectedThumbnailIndex(0); setThumbnailPreview(thumbnails[0]); }
      URL.revokeObjectURL(video.src);
    };
    video.src = URL.createObjectURL(videoFile); video.load();
  }, []);

  const handleAIVideoGenerated = useCallback(async (videoUrl: string, videoBlob: Blob) => {
    setShowAIVideoGenerator(false);
    const f = new File([videoBlob], `ai-video-${Date.now()}.mp4`, { type: 'video/mp4' });
    if (videoBlob.size === 0) {
      try { const r = await fetch(videoUrl); const b = await r.blob(); handleFileSelect(new File([b], `ai-video-${Date.now()}.mp4`, { type: 'video/mp4' })); }
      catch { toast.error('Failed to load AI video'); }
    } else handleFileSelect(f);
    if (!tags.includes('ai')) setTags(prev => [...prev, 'ai']);
  }, [tags]);

  useEffect(() => {
    if (file && showSafetyScanner) {
      if (file.type.startsWith('video/')) contentSafety.scanVideo(file);
      else contentSafety.scanImage(file);
    }
  }, [file, showSafetyScanner]);

  const handleFileSelect = useCallback((selectedFile: File) => {
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime'];
    if (!validTypes.includes(selectedFile.type)) { toast.error('Invalid file type'); return; }
    const maxSize = selectedFile.type.startsWith('video/') ? 2 * 1024 * 1024 * 1024 : 50 * 1024 * 1024;
    if (selectedFile.size > maxSize) { toast.error('File too large'); return; }
    const url = URL.createObjectURL(selectedFile);
    setPreview(url); setFile(selectedFile);
    if (selectedFile.type.startsWith('video/')) {
      const v = document.createElement('video'); v.preload = 'metadata';
      v.onloadedmetadata = () => {
        if (v.duration > 60) { setContentType('video'); generateThumbnailsFromVideo(selectedFile); }
        else setContentType('short');
        URL.revokeObjectURL(v.src);
      };
      v.src = url;
    } else setContentType('post');
    contentSafety.reset(); setShowSafetyScanner(true);
  }, [contentSafety, generateThumbnailsFromVideo]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const sf = e.target.files; if (!sf) return;
    if (sf.length > 1) handleMultiFileSelect(Array.from(sf));
    else if (sf[0]) handleFileSelect(sf[0]);
  };

  const handleMultiFileSelect = useCallback((selectedFiles: File[]) => {
    const imgs = selectedFiles.filter(f => f.type.startsWith('image/'));
    if (imgs.length === 0) { toast.error('Please select image files'); return; }
    if (imgs.length > 10) { toast.error('Maximum 10 images'); return; }
    const urls = imgs.map(f => URL.createObjectURL(f));
    setFiles(imgs); setPreviews(urls); setFile(imgs[0]); setPreview(urls[0]); setContentType('post');
    contentSafety.reset(); setShowSafetyScanner(true);
  }, [contentSafety]);

  const removeFileAtIndex = useCallback((index: number) => {
    URL.revokeObjectURL(previews[index]);
    const nf = files.filter((_, i) => i !== index); const np = previews.filter((_, i) => i !== index);
    setFiles(nf); setPreviews(np);
    if (nf.length > 0) { setFile(nf[0]); setPreview(np[0]); } else { setFile(null); setPreview(null); }
  }, [files, previews]);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }, []);
  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
    const df = Array.from(e.dataTransfer.files);
    if (df.length > 1) handleMultiFileSelect(df); else if (df[0]) handleFileSelect(df[0]);
  }, [handleFileSelect, handleMultiFileSelect]);

  const handleSafetyContinue = () => setShowSafetyScanner(false);
  const handleSafetyCancel = () => { setShowSafetyScanner(false); clearFile(); contentSafety.reset(); };
  const handleSafetyAppeal = () => { contentSafety.submitAppeal(file?.type.startsWith('video/') ? 'video' : 'image', 'User appealed'); setShowSafetyScanner(false); };

  const handleAddTag = (tag: string) => {
    const c = tag.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
    if (c && !tags.includes(c) && tags.length < 10) { setTags([...tags, c]); setTagInput(''); }
  };
  const handleRemoveTag = (t: string) => setTags(tags.filter(tag => tag !== t));
  const handleTagInputKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); handleAddTag(tagInput); } };
  const handleThumbnailSelect = (i: number) => { setSelectedThumbnailIndex(i); setThumbnailPreview(generatedThumbnails[i]); setThumbnailFile(null); };
  const handleCustomThumbnail = (e: React.ChangeEvent<HTMLInputElement>) => {
    const sf = e.target.files?.[0];
    if (sf) { if (!sf.type.startsWith('image/')) { toast.error('Select an image'); return; } setThumbnailFile(sf); setThumbnailPreview(URL.createObjectURL(sf)); setSelectedThumbnailIndex(null); }
  };

  const handleSubmit = async () => {
    if (contentType !== 'text' && !file && files.length === 0) { toast.error('Add some media'); return; }
    if (contentType === 'text' && !caption.trim()) { toast.error('Write something to share'); return; }
    if (!user) { toast.error('Sign in first'); return; }
    if (contentType === 'video' && !videoTitle.trim()) { toast.error('Add a video title'); return; }
    setIsUploading(true); setUploadProgress(0);
    try {
      const pi = setInterval(() => setUploadProgress(prev => Math.min(prev + 5, 90)), 300);
      const fc = contentType === 'video' ? `${videoTitle}${videoDescription ? `\n\n${videoDescription}` : ''}${caption ? `\n\n${caption}` : ''}` : caption;
      await createPost.mutateAsync({
        mediaFile: files.length <= 1 ? file || undefined : undefined,
        mediaFiles: files.length > 1 ? files : undefined,
        caption: fc, type: contentType, tags,
        thumbnailFile: thumbnailFile || undefined,
        thumbnailDataUrl: selectedThumbnailIndex !== null ? generatedThumbnails[selectedThumbnailIndex] : undefined,
      });
      clearInterval(pi); setUploadProgress(100); setPublishSuccess(true);
      setTimeout(() => { toast.success('Posted!'); navigate('/home'); }, 800);
    } catch { toast.error('Failed to upload'); }
    finally { setTimeout(() => { setIsUploading(false); setUploadProgress(0); }, 1000); }
  };

  const clearFile = () => {
    if (preview) URL.revokeObjectURL(preview);
    previews.forEach(p => URL.revokeObjectURL(p));
    if (thumbnailPreview && !generatedThumbnails.includes(thumbnailPreview)) URL.revokeObjectURL(thumbnailPreview);
    setFile(null); setFiles([]); setPreview(null); setPreviews([]);
    setVideoTitle(''); setVideoDescription(''); setThumbnailFile(null); setThumbnailPreview(null);
    setGeneratedThumbnails([]); setSelectedThumbnailIndex(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (thumbnailInputRef.current) thumbnailInputRef.current.value = '';
  };

  const hasMedia = file !== null || files.length > 0;
  const canSubmit = contentType === 'text' ? caption.trim().length > 0 : hasMedia;
  const currentVisibility = visibilityOptions.find(v => v.id === visibility)!;

  if (showCamera) return <Camera onClose={() => setShowCamera(false)} />;
  if (showAIVideoGenerator) return <AIVideoGenerator onVideoGenerated={handleAIVideoGenerated} onClose={() => setShowAIVideoGenerator(false)} />;

  return (
    <AppLayout hideNav noPadding>
      {/* Solid opaque cover — sits ABOVE the AppBackground (z-0) to fully block it */}
      <div className="fixed inset-0 z-[5]" style={{ backgroundColor: 'hsl(var(--background))' }} />

      {/* Safety scanner overlay */}
      {showSafetyScanner && file && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'hsl(var(--background) / 0.9)' }}>
          <ContentSafetyScanner isScanning={contentSafety.isScanning} result={contentSafety.result} message={contentSafety.message} scanDetails={contentSafety.scanDetails} onContinue={handleSafetyContinue} onCancel={handleSafetyCancel} onAppeal={handleSafetyAppeal} />
        </div>
      )}

      {/* Publish success overlay */}
      <AnimatePresence>
        {publishSuccess && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[100] flex items-center justify-center"
            style={{ backgroundColor: 'hsl(var(--background))' }}
          >
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15 }}
              className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-2xl shadow-primary/40"
            >
              <motion.svg initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.3, duration: 0.4 }}
                className="w-10 h-10 text-primary-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                <motion.path d="M5 13l4 4L19 7" />
              </motion.svg>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content — z-[10] to sit above the solid cover, full-screen on all devices */}
      <div className="relative z-[10] w-full h-[100dvh] max-w-none mx-0 flex flex-col overflow-hidden" style={{ backgroundColor: 'hsl(var(--background))' }}>

        {/* ━━━━ HEADER — solid, opaque ━━━━ */}
        <div className="sticky top-0 z-40 border-b border-border" style={{ backgroundColor: 'hsl(var(--card))' }}>
          <div className="flex items-center justify-between px-4 h-14">
            <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted transition-colors">
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
                <span className="flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5" />
                  Share
                </span>
              )}
            </motion.button>
          </div>

          {/* Upload progress bar */}
          {isUploading && (
            <motion.div className="h-0.5 bg-primary" initial={{ width: '0%' }} animate={{ width: `${uploadProgress}%` }} transition={{ duration: 0.3 }} />
          )}
        </div>

        {/* ━━━━ TYPE SELECTOR ━━━━ */}
        <div className="px-4 py-3 border-b border-border/50" style={{ backgroundColor: 'hsl(var(--background))' }}>
          <div className="flex gap-3 justify-evenly max-w-2xl mx-auto">
            {contentTypes.map((t, i) => {
              const active = contentType === t.id;
              return (
                <motion.button
                  key={t.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => { setContentType(t.id); if (t.id === 'text') clearFile(); }}
                  className={cn(
                    "flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200",
                    active
                      ? "bg-primary text-primary-foreground shadow-sm shadow-primary/25"
                      : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <t.icon className="w-3.5 h-3.5" />
                  {t.label}
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* ━━━━ NON-SCROLLABLE COMPOSER AREA ━━━━ */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* User row */}
          <div className="flex items-center gap-3 px-4 pt-3 pb-2 max-w-2xl mx-auto w-full">
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="w-10 h-10 rounded-full p-[2px] bg-gradient-to-br from-primary via-accent to-primary flex-shrink-0"
            >
              <div className="w-full h-full rounded-full overflow-hidden bg-card">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground">
                    {profile?.username?.[0]?.toUpperCase() || '?'}
                  </div>
                )}
              </div>
            </motion.div>

            <div className="flex flex-col gap-0.5">
              {profile && (
                <StyledUsername userId={profile.id} username={profile.username} displayName={profile.display_name} className="text-sm font-bold" />
              )}
              <div className="relative">
                <button
                  onClick={() => setShowVisibility(!showVisibility)}
                  className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-muted text-muted-foreground hover:bg-accent transition-colors"
                >
                  <currentVisibility.icon className="w-3 h-3" />
                  {currentVisibility.label}
                  <ChevronDown className={cn("w-3 h-3 transition-transform", showVisibility && "rotate-180")} />
                </button>
                <AnimatePresence>
                  {showVisibility && (
                    <motion.div
                      initial={{ opacity: 0, y: -4, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="absolute top-full left-0 mt-1.5 z-50 min-w-[170px] py-1.5 rounded-xl border border-border shadow-xl"
                      style={{ backgroundColor: 'hsl(var(--card))' }}
                    >
                      {visibilityOptions.map((opt) => (
                        <button
                          key={opt.id}
                          onClick={() => { setVisibility(opt.id); setShowVisibility(false); }}
                          className={cn(
                            "w-full flex items-center gap-2.5 px-3 py-2.5 text-xs transition-colors",
                            visibility === opt.id ? "text-primary bg-primary/10" : "text-foreground hover:bg-muted"
                          )}
                        >
                          <opt.icon className="w-4 h-4" />
                          <div className="text-left">
                            <p className="font-medium">{opt.label}</p>
                            <p className="text-[10px] text-muted-foreground">{opt.description}</p>
                          </div>
                          {visibility === opt.id && <Check className="w-3.5 h-3.5 ml-auto text-primary" />}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Caption input */}
          <div className="px-4 pb-1 max-w-2xl mx-auto w-full">
            <textarea
              ref={captionRef}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder={
                contentType === 'text' ? "What's on your mind?" :
                contentType === 'video' ? "Describe your video..." :
                "Write a caption..."
              }
              className={cn(
                "w-full bg-transparent text-foreground placeholder:text-muted-foreground resize-none outline-none leading-relaxed",
                contentType === 'text' ? "text-lg min-h-[100px]" : "text-[15px] min-h-[44px]"
              )}
              maxLength={2200}
              rows={1}
            />

            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1 mb-1">
                {tags.map((tag) => (
                  <motion.span
                    key={tag}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    layout
                    className="inline-flex items-center gap-1 text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full font-medium cursor-pointer hover:bg-primary/20 transition-colors"
                    onClick={() => handleRemoveTag(tag)}
                  >
                    #{tag}
                    <X className="w-2.5 h-2.5" />
                  </motion.span>
                ))}
              </div>
            )}
          </div>

          {/* ━━━━ TOOLBAR — between caption and media ━━━━ */}
          <div className="flex-shrink-0 border-y border-border/50 px-4 max-w-2xl mx-auto w-full" style={{ backgroundColor: 'hsl(var(--card))' }}>
            <div className="flex items-center justify-between h-11">
              <div className="flex items-center gap-0.5">
                {contentType !== 'text' && (
                  <>
                    <button onClick={() => fileInputRef.current?.click()} className="w-9 h-9 rounded-full flex items-center justify-center text-primary hover:bg-muted transition-colors" title="Add media">
                      <Image className="w-[18px] h-[18px]" />
                    </button>
                    <button onClick={() => setShowCamera(true)} className="w-9 h-9 rounded-full flex items-center justify-center text-primary hover:bg-muted transition-colors" title="Camera">
                      <CameraIcon className="w-[18px] h-[18px]" />
                    </button>
                    <button onClick={() => setShowAIVideoGenerator(true)} className="w-9 h-9 rounded-full flex items-center justify-center text-primary hover:bg-muted transition-colors" title="AI Features">
                      <Wand2 className="w-[18px] h-[18px]" />
                    </button>
                  </>
                )}
                <button
                  onClick={() => { const tag = prompt('Add a tag:'); if (tag) handleAddTag(tag); }}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
                  title="Add tag"
                >
                  <Hash className="w-[18px] h-[18px]" />
                </button>
                <AICaptionGenerator tags={tags} contentType={contentType === 'text' ? 'post' : contentType} onSelectCaption={setCaption} />
              </div>

              <span className={cn(
                "text-xs tabular-nums font-medium",
                caption.length > 2000 ? "text-destructive" : "text-muted-foreground"
              )}>
                {caption.length > 0 && `${caption.length}/2200`}
              </span>
            </div>

            {tags.length === 0 && (
              <div className="flex gap-2 pb-2 overflow-x-auto scrollbar-hide">
                {suggestedTags.slice(0, 7).map((tag) => (
                  <button
                    key={tag}
                    onClick={() => handleAddTag(tag)}
                    className="flex-shrink-0 text-[11px] px-3 py-1 rounded-full border border-border/50 text-muted-foreground hover:bg-accent hover:text-accent-foreground hover:border-primary/30 transition-all font-medium"
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ━━━ MEDIA AREA — fills remaining space ━━━ */}
          <div className="flex-1 overflow-hidden px-4 py-3 max-w-2xl mx-auto w-full" style={{ backgroundColor: 'hsl(var(--background))' }}>
            {contentType !== 'text' && hasMedia && (
              <motion.div 
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                {previews.length > 1 ? (
                  <div className="space-y-3">
                    <div className={cn(
                      "grid gap-1.5 rounded-2xl overflow-hidden border border-border",
                      previews.length === 2 && "grid-cols-2",
                      previews.length === 3 && "grid-cols-3",
                      previews.length >= 4 && "grid-cols-3"
                    )} style={{ backgroundColor: 'hsl(var(--muted))' }}>
                      {previews.slice(0, 9).map((p, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: i * 0.05 }}
                          className={cn(
                            "relative group aspect-square overflow-hidden",
                            previews.length === 3 && i === 0 && "row-span-2 col-span-2"
                          )}
                        >
                          <img src={p} alt="" className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                          <motion.button
                            whileTap={{ scale: 0.85 }}
                            onClick={() => removeFileAtIndex(i)}
                            className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-lg"
                            style={{ backgroundColor: 'hsl(var(--background) / 0.9)' }}
                          >
                            <X className="w-3.5 h-3.5 text-foreground" />
                          </motion.button>
                          {i === 8 && previews.length > 9 && (
                            <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: 'hsl(var(--background) / 0.6)' }}>
                              <span className="text-foreground font-bold text-lg">+{previews.length - 9}</span>
                            </div>
                          )}
                        </motion.div>
                      ))}
                      {previews.length < 10 && (
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="aspect-square flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-muted-foreground/20 hover:border-primary/40 transition-all rounded-lg"
                          style={{ backgroundColor: 'hsl(var(--muted) / 0.5)' }}
                        >
                          <Plus className="w-5 h-5 text-muted-foreground" />
                          <span className="text-[10px] font-medium text-muted-foreground">Add</span>
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground text-center">{previews.length}/10 photos</p>
                  </div>
                ) : preview && (
                  <div className="relative rounded-2xl overflow-hidden border border-border" style={{ backgroundColor: 'hsl(var(--muted))' }}>
                    {file?.type.startsWith('video/') ? (
                      <video 
                        src={preview} 
                        className="w-full max-h-[45dvh] object-contain mx-auto block" 
                        style={{ backgroundColor: 'hsl(var(--muted))' }}
                        controls 
                        playsInline 
                      />
                    ) : (
                      <img 
                        src={preview} 
                        alt="" 
                        className="w-full max-h-[45dvh] object-contain mx-auto block"
                        style={{ backgroundColor: 'hsl(var(--muted))' }}
                      />
                    )}
                    <motion.button
                      whileTap={{ scale: 0.85 }}
                      onClick={clearFile}
                      className="absolute top-3 right-3 w-9 h-9 rounded-full border border-border flex items-center justify-center shadow-lg transition-colors hover:bg-background"
                      style={{ backgroundColor: 'hsl(var(--background) / 0.9)' }}
                    >
                      <X className="w-4 h-4 text-foreground" />
                    </motion.button>
                  </div>
                )}
              </motion.div>
            )}

            {/* Drop zone */}
            {contentType !== 'text' && !hasMedia && (
              <motion.div 
                initial={{ opacity: 0, y: 16 }} 
                animate={{ opacity: 1, y: 0 }} 
                transition={{ duration: 0.35, delay: 0.1 }}
                className="h-full flex items-center justify-center"
              >
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "w-full rounded-2xl border-2 border-dashed cursor-pointer transition-all text-center",
                    "py-12 sm:py-16",
                    isDragging
                      ? "border-primary bg-primary/5 scale-[1.01]"
                      : "border-muted-foreground/20 hover:border-primary/40 hover:bg-muted/30"
                  )}
                  style={{ backgroundColor: isDragging ? undefined : 'hsl(var(--muted) / 0.15)' }}
                >
                  <motion.div 
                    className="flex flex-col items-center gap-3"
                    animate={isDragging ? { scale: 1.05 } : { scale: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  >
                    <div className={cn(
                      "w-14 h-14 rounded-2xl flex items-center justify-center transition-colors",
                      isDragging ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                    )}>
                      <UploadIcon className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-foreground">
                        {isDragging ? 'Drop here' : 'Tap to add photos or videos'}
                      </p>
                      <p className="text-xs text-muted-foreground">Up to 10 images · Carousel supported</p>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <button 
                        onClick={(e) => { e.stopPropagation(); setShowCamera(true); }}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                      >
                        <CameraIcon className="w-3.5 h-3.5" /> Camera
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setShowAIVideoGenerator(true); }}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                      >
                        <Wand2 className="w-3.5 h-3.5" /> AI Features
                      </button>
                    </div>
                  </motion.div>
                </div>
              </motion.div>
            )}

            {/* Video details */}
            {contentType === 'video' && file && (
              <motion.div 
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-3"
              >
                <div className="space-y-3 p-4 rounded-2xl border border-border" style={{ backgroundColor: 'hsl(var(--card))' }}>
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Video className="w-4 h-4 text-primary" /> Video details
                  </div>
                  <Input value={videoTitle} onChange={(e) => setVideoTitle(e.target.value)} placeholder="Video title" className="h-10 text-sm bg-muted border-border" maxLength={100} />
                  <textarea value={videoDescription} onChange={(e) => setVideoDescription(e.target.value)} placeholder="Description..."
                    className="w-full min-h-[60px] bg-muted text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none border border-border rounded-xl px-3 py-2.5" maxLength={5000} />
                  {generatedThumbnails.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-xs font-medium text-muted-foreground">Thumbnail</span>
                      <div className="grid grid-cols-4 gap-2">
                        {generatedThumbnails.map((th, i) => (
                          <button key={i} onClick={() => handleThumbnailSelect(i)}
                            className={cn("aspect-video rounded-lg overflow-hidden border-2 transition-all", selectedThumbnailIndex === i ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/40")}>
                            <img src={th} alt="" className="w-full h-full object-cover" />
                          </button>
                        ))}
                        <button onClick={() => thumbnailInputRef.current?.click()}
                          className="aspect-video rounded-lg border-2 border-dashed border-border flex items-center justify-center hover:border-primary/40 transition-colors bg-muted">
                          <ImagePlus className="w-4 h-4 text-muted-foreground" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple onChange={handleInputChange} className="hidden" />
      <input ref={thumbnailInputRef} type="file" accept="image/*" onChange={handleCustomThumbnail} className="hidden" />
    </AppLayout>
  );
}
