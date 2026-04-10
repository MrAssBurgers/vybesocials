import { useState, useRef, useCallback, useMemo, useEffect, DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Send, Tag, Hash, X, Globe, Users, Lock, ChevronDown, Check,
  Sparkles, Image as ImageIcon, Plus, Upload as UploadIcon, Camera as CameraIcon,
  Wand2, Video, Film, Type, Layers, Crop, RotateCw, Sliders, Scissors
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCreatePost } from '@/hooks/usePosts';
import { useAuth } from '@/lib/auth';
import { useContentSafety } from '@/hooks/useContentSafety';
import { VybeCheckFailed } from '@/components/safety/VybeCheckFailed';
import { SafetyScanProgress } from '@/components/safety/SafetyScanProgress';
import { AICaptionGenerator } from '@/components/ai/AICaptionGenerator';
import { AIVideoGenerator } from '@/components/ai/AIVideoGenerator';
import { StyledUsername } from '@/components/ui/StyledUsername';
import { INTEREST_CATEGORIES, getSuggestedTagsForInterests } from '@/lib/tagCategories';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Camera } from '@/components/camera/Camera';
import { toast } from 'sonner';
import { ImageCropEditor } from './editors/ImageCropEditor';
import { ImageRotateEditor } from './editors/ImageRotateEditor';
import { ImageFilterEditor } from './editors/ImageFilterEditor';
import { VideoTrimEditor } from './editors/VideoTrimEditor';

const visibilityOptions = [
  { id: 'public' as const, label: 'Everyone', icon: Globe, description: 'Visible to all' },
  { id: 'followers' as const, label: 'Followers', icon: Users, description: 'Only followers' },
  { id: 'private' as const, label: 'Only me', icon: Lock, description: 'Private post' },
];

interface DesktopCreateStudioProps {
  onClose: () => void;
}

export function DesktopCreateStudio({ onClose }: DesktopCreateStudioProps) {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const createPost = useCreatePost();
  const contentSafety = useContentSafety();

  const [contentType, setContentType] = useState<'text' | 'post' | 'short' | 'video'>('post');
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [caption, setCaption] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [visibility, setVisibility] = useState<'public' | 'followers' | 'private'>('public');
  const [showCamera, setShowCamera] = useState(false);
  const [showAIVideoGen, setShowAIVideoGen] = useState(false);
  const [showSafety, setShowSafety] = useState(false);
  const [vybeCheckFailed, setVybeCheckFailed] = useState(false);
  const [scanMessage, setScanMessage] = useState('');
  const [scanCategories, setScanCategories] = useState<string[]>([]);
  const [publishSuccess, setPublishSuccess] = useState(false);
  const [activePreview, setActivePreview] = useState(0);
  const [videoTitle, setVideoTitle] = useState('');
  const [videoDescription, setVideoDescription] = useState('');
  const [activeEditor, setActiveEditor] = useState<'crop' | 'rotate' | 'filters' | 'trim' | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const captionRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = captionRef.current;
    if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 200) + 'px'; }
  }, [caption]);

  const handleFileSelect = useCallback((selectedFiles: File[]) => {
    const validFiles = selectedFiles.filter(f => {
      const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime'];
      return validTypes.includes(f.type);
    }).slice(0, 10);
    if (validFiles.length === 0) return;

    const urls = validFiles.map(f => URL.createObjectURL(f));
    setFiles(validFiles);
    setPreviews(urls);
    setActivePreview(0);

    // Auto-detect content type
    if (validFiles[0].type.startsWith('video/')) {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => {
        setContentType(v.duration > 60 ? 'video' : 'short');
        URL.revokeObjectURL(v.src);
      };
      v.src = urls[0];
    } else {
      setContentType('post');
    }

    // Don't scan on file select — scan at post time
    contentSafety.reset();
  }, [contentSafety]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const sf = Array.from(e.target.files || []);
    if (sf.length > 0) handleFileSelect(sf);
  };

  const handleDragOver = useCallback((e: DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e: DragEvent) => { e.preventDefault(); setIsDragging(false); }, []);
  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    handleFileSelect(Array.from(e.dataTransfer.files));
  }, [handleFileSelect]);

  const removeFile = (i: number) => {
    URL.revokeObjectURL(previews[i]);
    const nf = files.filter((_, idx) => idx !== i);
    const np = previews.filter((_, idx) => idx !== i);
    setFiles(nf); setPreviews(np);
    if (activePreview >= np.length) setActivePreview(Math.max(0, np.length - 1));
  };

  const clearAll = () => {
    previews.forEach(p => URL.revokeObjectURL(p));
    setFiles([]); setPreviews([]); setActivePreview(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleAddTag = (tag: string) => {
    const c = tag.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
    if (c && !tags.includes(c) && tags.length < 10) { setTags([...tags, c]); setTagInput(''); }
  };

  const smartSuggestions = useMemo(() => {
    const userInterests = (profile as any)?.interests || [];
    if (userInterests.length === 0) {
      return INTEREST_CATEGORIES.slice(0, 8).flatMap(cat => cat.tags.slice(0, 2).map(tag => ({ tag, emoji: cat.emoji, category: cat.id })));
    }
    return getSuggestedTagsForInterests(userInterests);
  }, [profile]);

  const canSubmit = (contentType === 'text' ? caption.trim().length > 0 : files.length > 0) && tags.length > 0;

  const handleSubmit = async () => {
    if (!canSubmit || !user) return;
    if (contentType === 'video' && !videoTitle.trim()) { toast.error('Add a video title'); return; }

    // Run AI safety scan at post time
    if (files.length > 0 && files[0]) {
      setIsUploading(true); setUploadProgress(0);
      setShowSafety(true);

      let scanResult;
      if (files[0].type.startsWith('video/')) {
        scanResult = await contentSafety.scanVideo(files[0]);
      } else {
        scanResult = await contentSafety.scanImage(files[0]);
      }

      setShowSafety(false);

      if (scanResult.result === 'blocked') {
        setIsUploading(false);
        setScanMessage(scanResult.message || 'Content violates community guidelines');
        setScanCategories(scanResult.categories || []);
        setVybeCheckFailed(true);
        return;
      }
    }

    setIsUploading(true); setUploadProgress(0);
    const isLargeFile = files[0] && files[0].size > 5 * 1024 * 1024;
    let pi: ReturnType<typeof setInterval> | null = null;
    try {
      pi = setInterval(() => setUploadProgress(prev => Math.min(prev + (isLargeFile ? 1 : 5), 85)), isLargeFile ? 500 : 300);
      const fc = contentType === 'video' ? `${videoTitle}${videoDescription ? `\n\n${videoDescription}` : ''}${caption ? `\n\n${caption}` : ''}` : caption;
      await createPost.mutateAsync({
        mediaFile: files.length <= 1 ? files[0] || undefined : undefined,
        mediaFiles: files.length > 1 ? files : undefined,
        caption: fc, type: contentType, tags,
      });
      if (pi) clearInterval(pi);
      setUploadProgress(100); setPublishSuccess(true);
      setTimeout(() => { toast.success('Posted!'); navigate('/home'); }, 800);
    } catch (err) {
      toast.error('Failed to upload');
    } finally {
      if (pi) clearInterval(pi);
      setTimeout(() => { setIsUploading(false); setUploadProgress(0); }, 1000);
    }
  };

  const handleAIVideoGenerated = useCallback(async (videoUrl: string, videoBlob: Blob) => {
    setShowAIVideoGen(false);
    const f = new File([videoBlob], `ai-video-${Date.now()}.mp4`, { type: 'video/mp4' });
    handleFileSelect([videoBlob.size > 0 ? f : await fetch(videoUrl).then(r => r.blob()).then(b => new File([b], `ai-video-${Date.now()}.mp4`, { type: 'video/mp4' }))]);
    if (!tags.includes('ai')) setTags(prev => [...prev, 'ai']);
  }, [handleFileSelect, tags]);

  // Editor callbacks
  const handleEditorApply = useCallback((newFile: File) => {
    const newUrl = URL.createObjectURL(newFile);
    setFiles(prev => { const nf = [...prev]; nf[activePreview] = newFile; return nf; });
    setPreviews(prev => { URL.revokeObjectURL(prev[activePreview]); const np = [...prev]; np[activePreview] = newUrl; return np; });
    setActiveEditor(null);
    toast.success('Edit applied');
  }, [activePreview]);

  const handleTrimApply = useCallback((file: File, start: number, end: number) => {
    // Store trim data — actual trimming can happen at upload time
    toast.success(`Trim set: ${start.toFixed(1)}s – ${end.toFixed(1)}s`);
    setActiveEditor(null);
  }, []);

  const isCurrentFileVideo = files[activePreview]?.type?.startsWith('video/');
  const hasMedia = files.length > 0;

  if (showCamera) return <Camera onClose={() => setShowCamera(false)} />;
  if (showAIVideoGen) return <AIVideoGenerator onVideoGenerated={handleAIVideoGenerated} onClose={() => setShowAIVideoGen(false)} />;

  // Editor overlays
  if (activeEditor === 'crop' && previews[activePreview]) {
    return <ImageCropEditor imageUrl={previews[activePreview]} onApply={handleEditorApply} onCancel={() => setActiveEditor(null)} />;
  }
  if (activeEditor === 'rotate' && previews[activePreview]) {
    return <ImageRotateEditor imageUrl={previews[activePreview]} onApply={handleEditorApply} onCancel={() => setActiveEditor(null)} />;
  }
  if (activeEditor === 'filters' && previews[activePreview]) {
    return <ImageFilterEditor imageUrl={previews[activePreview]} isVideo={isCurrentFileVideo} onApply={handleEditorApply} onCancel={() => setActiveEditor(null)} />;
  }
  if (activeEditor === 'trim' && previews[activePreview] && files[activePreview]) {
    return <VideoTrimEditor videoUrl={previews[activePreview]} videoFile={files[activePreview]} onApply={handleTrimApply} onCancel={() => setActiveEditor(null)} />;
  }

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: 'hsl(var(--background))' }}>
      {/* Vybe Check Failed overlay */}
      {vybeCheckFailed && (
        <VybeCheckFailed
          message={scanMessage}
          categories={scanCategories}
          caption={caption}
          tags={tags}
          mediaUrls={previews}
          contentType={contentType}
          onEdit={() => setVybeCheckFailed(false)}
          onAppealComplete={() => { setVybeCheckFailed(false); navigate('/home'); }}
        />
      )}

      {/* Safety scan overlay */}
      <AnimatePresence>
        {showSafety && contentSafety.isScanning && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center bg-background/95 backdrop-blur-sm"
          >
            <div className="w-80 space-y-6 text-center">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center"
              >
                <Sparkles className="h-8 w-8 text-primary" />
              </motion.div>
              <div>
                <p className="text-foreground font-bold text-lg mb-1">Vybe Check</p>
                <p className="text-muted-foreground text-sm">{contentSafety.message || 'Scanning your content...'}</p>
              </div>
              <SafetyScanProgress 
                phase={contentSafety.scanPhase} 
                isVideo={files[0]?.type.startsWith('video/')} 
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success overlay */}
      <AnimatePresence>
        {publishSuccess && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[100] flex items-center justify-center" style={{ backgroundColor: 'hsl(var(--background))' }}>
            <motion.div initial={{ scale: 0, rotate: -180 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 15 }}
              className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-2xl shadow-primary/40">
              <Check className="w-10 h-10 text-primary-foreground" strokeWidth={3} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="border-b border-border px-6 h-14 flex items-center justify-between flex-shrink-0" style={{ backgroundColor: 'hsl(var(--card))' }}>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-base font-bold text-foreground">Create Studio</span>
          </div>
        </div>
        <motion.button onClick={handleSubmit} disabled={!canSubmit || isUploading} whileTap={canSubmit ? { scale: 0.95 } : {}}
          className={cn("h-9 px-6 rounded-full text-sm font-bold transition-all",
            canSubmit && !isUploading ? "bg-primary text-primary-foreground shadow-md shadow-primary/25" : "bg-muted text-muted-foreground cursor-not-allowed")}>
          {isUploading ? <span className="flex items-center gap-1.5"><motion.span className="w-3.5 h-3.5 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.6, ease: 'linear' }} />{uploadProgress}%</span>
            : <span className="flex items-center gap-1.5"><Send className="w-3.5 h-3.5" /> Publish</span>}
        </motion.button>
      </div>
      {isUploading && <motion.div className="h-0.5 bg-primary flex-shrink-0" initial={{ width: '0%' }} animate={{ width: `${uploadProgress}%` }} />}

      {/* Split panels */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT — Preview */}
        <div className="flex-1 min-w-0 flex items-center justify-center p-6 border-r border-border/50" style={{ backgroundColor: 'hsl(var(--muted) / 0.3)' }}>
          {files.length > 0 ? (
            <div className="w-full max-w-lg space-y-4">
              {/* Main preview */}
              <div className="relative rounded-2xl overflow-hidden border border-border shadow-lg" style={{ backgroundColor: 'hsl(var(--muted))' }}>
                {files[activePreview]?.type.startsWith('video/') ? (
                  <video src={previews[activePreview]} className="w-full max-h-[60vh] object-contain mx-auto" controls playsInline />
                ) : (
                  <img src={previews[activePreview]} alt="" className="w-full max-h-[60vh] object-contain mx-auto" />
                )}
                <button onClick={clearAll} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center hover:bg-background transition-colors border border-border">
                  <X className="w-4 h-4 text-foreground" />
                </button>
              </div>

              {/* Thumbnail strip for multi */}
              {previews.length > 1 && (
                <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                  {previews.map((p, i) => (
                    <motion.button
                      key={i}
                      onClick={() => setActivePreview(i)}
                      draggable
                      onDragStart={(e) => (e as any).dataTransfer?.setData('text/plain', String(i))}
                      onDragOver={(e) => (e as any).preventDefault?.()}
                      onDrop={(e) => {
                        (e as any).preventDefault?.();
                        const from = parseInt((e as any).dataTransfer?.getData('text/plain') || '0');
                        if (from === i || isNaN(from)) return;
                        const nf = [...files]; const np = [...previews];
                        const [mf] = nf.splice(from, 1); const [mp] = np.splice(from, 1);
                        nf.splice(i, 0, mf); np.splice(i, 0, mp);
                        setFiles(nf); setPreviews(np);
                      }}
                      className={cn("relative w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 border-2 transition-all cursor-grab active:cursor-grabbing",
                        activePreview === i ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/40")}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <img src={p} alt="" className="w-full h-full object-cover" />
                      <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">{i + 1}</div>
                      <button onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                        className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-background/80 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity">
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </motion.button>
                  ))}
                  {previews.length < 10 && (
                    <button onClick={() => fileInputRef.current?.click()}
                      className="w-16 h-16 rounded-xl border-2 border-dashed border-border hover:border-primary/40 flex items-center justify-center transition-colors flex-shrink-0">
                      <Plus className="w-5 h-5 text-muted-foreground" />
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* Drop zone */
            <div
              onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn("w-full max-w-md rounded-2xl border-2 border-dashed cursor-pointer transition-all text-center py-20",
                isDragging ? "border-primary bg-primary/5 scale-[1.01]" : "border-muted-foreground/20 hover:border-primary/40 hover:bg-muted/30")}
            >
              <motion.div className="flex flex-col items-center gap-4" animate={isDragging ? { scale: 1.05 } : { scale: 1 }}>
                <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center", isDragging ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>
                  <UploadIcon className="w-7 h-7" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">{isDragging ? 'Drop here' : 'Drag & drop files here'}</p>
                  <p className="text-xs text-muted-foreground">Up to 10 photos/videos · Carousel supported</p>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <button onClick={(e) => { e.stopPropagation(); setShowCamera(true); }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium bg-muted text-muted-foreground hover:bg-accent transition-colors">
                    <CameraIcon className="w-3.5 h-3.5" /> Camera
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setShowAIVideoGen(true); }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium bg-muted text-muted-foreground hover:bg-accent transition-colors">
                    <Wand2 className="w-3.5 h-3.5" /> AI Video
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </div>

        {/* RIGHT — Studio Tabs */}
        <div className="w-[380px] flex-shrink-0 flex flex-col overflow-hidden" style={{ backgroundColor: 'hsl(var(--background))' }}>
          <Tabs defaultValue="post" className="flex-1 flex flex-col overflow-hidden">
            <div className="px-4 pt-3 flex-shrink-0">
              <TabsList className="w-full">
                <TabsTrigger value="media" className="flex-1 text-xs">Media</TabsTrigger>
                <TabsTrigger value="edit" className="flex-1 text-xs">Edit</TabsTrigger>
                <TabsTrigger value="post" className="flex-1 text-xs">Post</TabsTrigger>
              </TabsList>
            </div>

            {/* MEDIA TAB */}
            <TabsContent value="media" className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">Content Type</p>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { id: 'post' as const, icon: ImageIcon, label: 'Photo' },
                    { id: 'short' as const, icon: Film, label: 'Clip' },
                    { id: 'video' as const, icon: Video, label: 'Video' },
                    { id: 'text' as const, icon: Type, label: 'Text' },
                  ].map(t => (
                    <button key={t.id} onClick={() => { setContentType(t.id); if (t.id === 'text') clearAll(); }}
                      className={cn("flex flex-col items-center gap-1 p-3 rounded-xl border transition-all text-xs font-medium",
                        contentType === t.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40")}>
                      <t.icon className="w-4 h-4" />
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">Files ({files.length}/10)</p>
                <button onClick={() => fileInputRef.current?.click()}
                  className="w-full py-3 rounded-xl border border-dashed border-border hover:border-primary/40 text-xs text-muted-foreground hover:text-primary transition-all flex items-center justify-center gap-2">
                  <Plus className="w-4 h-4" /> Add media
                </button>
              </div>
            </TabsContent>

            {/* EDIT TAB */}
            <TabsContent value="edit" className="flex-1 overflow-y-auto px-4 py-3">
              {hasMedia ? (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground">Per-Slide Tools — Slide {activePreview + 1}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => !isCurrentFileVideo && setActiveEditor('crop')}
                      disabled={isCurrentFileVideo}
                      className={cn("flex items-center gap-2 p-3 rounded-xl border text-xs font-medium transition-all",
                        isCurrentFileVideo ? "border-border/50 text-muted-foreground/40 cursor-not-allowed" : "border-border text-muted-foreground hover:border-primary/40 hover:text-primary")}>
                      <Crop className="w-4 h-4" /> Crop
                    </button>
                    <button onClick={() => !isCurrentFileVideo && setActiveEditor('rotate')}
                      disabled={isCurrentFileVideo}
                      className={cn("flex items-center gap-2 p-3 rounded-xl border text-xs font-medium transition-all",
                        isCurrentFileVideo ? "border-border/50 text-muted-foreground/40 cursor-not-allowed" : "border-border text-muted-foreground hover:border-primary/40 hover:text-primary")}>
                      <RotateCw className="w-4 h-4" /> Rotate
                    </button>
                    <button onClick={() => setActiveEditor('filters')}
                      className="flex items-center gap-2 p-3 rounded-xl border border-border text-xs font-medium text-muted-foreground hover:border-primary/40 hover:text-primary transition-all">
                      <Sliders className="w-4 h-4" /> Filters
                    </button>
                    <button onClick={() => isCurrentFileVideo && setActiveEditor('trim')}
                      disabled={!isCurrentFileVideo}
                      className={cn("flex items-center gap-2 p-3 rounded-xl border text-xs font-medium transition-all",
                        !isCurrentFileVideo ? "border-border/50 text-muted-foreground/40 cursor-not-allowed" : "border-border text-muted-foreground hover:border-primary/40 hover:text-primary")}>
                      <Scissors className="w-4 h-4" /> Trim
                    </button>
                  </div>
                  {isCurrentFileVideo && <p className="text-[10px] text-muted-foreground/60 text-center">Crop & Rotate are for images only. Use Trim for video.</p>}
                  {!isCurrentFileVideo && <p className="text-[10px] text-muted-foreground/60 text-center">Trim is for videos only.</p>}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Sliders className="w-8 h-8 text-muted-foreground/30 mb-3" />
                  <p className="text-sm font-medium text-muted-foreground">Add media first</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Upload a photo or video to use editing tools</p>
                </div>
              )}
            </TabsContent>

            {/* POST TAB */}
            <TabsContent value="post" className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
              {/* User */}
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full p-[2px] bg-gradient-to-br from-primary to-accent flex-shrink-0">
                  <div className="w-full h-full rounded-full overflow-hidden bg-card">
                    {profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">{profile?.username?.[0]?.toUpperCase()}</div>}
                  </div>
                </div>
                {profile && <StyledUsername userId={profile.id} username={profile.username} displayName={profile.display_name} className="text-sm font-bold" />}
              </div>

              {/* Caption */}
              <div>
                <textarea ref={captionRef} value={caption} onChange={(e) => setCaption(e.target.value)}
                  placeholder={contentType === 'text' ? "What's on your mind?" : "Write a caption..."}
                  className="w-full bg-transparent text-foreground placeholder:text-muted-foreground resize-none outline-none leading-relaxed text-sm min-h-[60px]"
                  maxLength={2200} rows={2} />
                <div className="flex justify-between items-center">
                  <AICaptionGenerator tags={tags} contentType={contentType === 'text' ? 'post' : contentType} onSelectCaption={setCaption} />
                  <span className="text-[10px] text-muted-foreground">{caption.length}/2200</span>
                </div>
              </div>

              {/* Video details */}
              {contentType === 'video' && (
                <div className="space-y-2 p-3 rounded-xl border border-border" style={{ backgroundColor: 'hsl(var(--card))' }}>
                  <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><Video className="w-3.5 h-3.5 text-primary" /> Video details</p>
                  <input value={videoTitle} onChange={(e) => setVideoTitle(e.target.value)} placeholder="Title" className="w-full text-sm bg-muted border border-border rounded-lg px-3 py-2 text-foreground placeholder:text-muted-foreground outline-none" maxLength={100} />
                  <textarea value={videoDescription} onChange={(e) => setVideoDescription(e.target.value)} placeholder="Description" className="w-full min-h-[50px] text-sm bg-muted border border-border rounded-lg px-3 py-2 text-foreground placeholder:text-muted-foreground outline-none resize-none" maxLength={5000} />
                </div>
              )}

              {/* Visibility */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1.5">Audience</p>
                <div className="flex gap-2">
                  {visibilityOptions.map(opt => (
                    <button key={opt.id} onClick={() => setVisibility(opt.id)}
                      className={cn("flex-1 flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-all",
                        visibility === opt.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40")}>
                      <opt.icon className="w-3.5 h-3.5" /> {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tags */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Tag className={cn("w-3.5 h-3.5", tags.length > 0 ? "text-primary" : "text-destructive")} />
                  <span className={cn("text-xs font-medium", tags.length > 0 ? "text-primary" : "text-destructive")}>
                    {tags.length === 0 ? 'Add at least 1 tag' : `${tags.length} tag${tags.length > 1 ? 's' : ''}`}
                  </span>
                </div>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {tags.map(tag => (
                      <span key={tag} onClick={() => setTags(tags.filter(t => t !== tag))}
                        className="inline-flex items-center gap-1 text-xs text-primary bg-primary/10 px-2.5 py-1 rounded-full font-medium cursor-pointer hover:bg-primary/20">
                        #{tag} <X className="w-2.5 h-2.5" />
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex-1 relative">
                    <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input type="text" value={tagInput} onChange={(e) => setTagInput(e.target.value.replace(/\s/g, ''))}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); handleAddTag(tagInput); } }}
                      placeholder="Add tag..." className="w-full pl-8 pr-3 py-2 text-xs bg-muted/50 rounded-full border border-border/50 text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 transition-all" maxLength={30} />
                  </div>
                  {tagInput.trim() && (
                    <button onClick={() => handleAddTag(tagInput)} className="h-7 px-3 rounded-full bg-primary text-primary-foreground text-xs font-semibold">Add</button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {smartSuggestions.filter(s => !tags.includes(s.tag)).slice(0, 6).map(s => (
                    <button key={s.tag} onClick={() => handleAddTag(s.tag)}
                      className="text-[11px] px-2.5 py-1 rounded-full border border-border/50 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-all font-medium">
                      #{s.tag}
                    </button>
                  ))}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple onChange={handleInputChange} className="hidden" />
    </div>
  );
}
