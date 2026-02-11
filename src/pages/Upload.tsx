import { useState, useCallback, useRef, useEffect, DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Camera } from '@/components/camera/Camera';
import { ContentSafetyScanner } from '@/components/safety/ContentSafetyScanner';
import { AICaptionGenerator } from '@/components/ai/AICaptionGenerator';
import { AIVideoGenerator } from '@/components/ai/AIVideoGenerator';
import { useCreatePost } from '@/hooks/usePosts';
import { useContentSafety } from '@/hooks/useContentSafety';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import {
  Image, Video, Film, X, Plus, Camera as CameraIcon,
  Upload as UploadIcon, Wand2, ImagePlus, ArrowLeft, Type,
  Hash, Send, ChevronDown, Layers
} from 'lucide-react';
import { useIsMobileOrTablet } from '@/hooks/use-mobile';
import { Label } from '@/components/ui/label';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useAuth as useAuthProfile } from '@/lib/auth';

const suggestedTags = ['photography', 'art', 'music', 'gaming', 'food', 'travel', 'fashion', 'fitness', 'ai'];

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

  // Long-form video specific fields
  const [videoTitle, setVideoTitle] = useState('');
  const [videoDescription, setVideoDescription] = useState('');
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [generatedThumbnails, setGeneratedThumbnails] = useState<string[]>([]);
  const [selectedThumbnailIndex, setSelectedThumbnailIndex] = useState<number | null>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);

  // Auto-resize caption textarea
  const autoResizeCaption = useCallback(() => {
    const el = captionRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 200) + 'px';
    }
  }, []);

  useEffect(() => { autoResizeCaption(); }, [caption, autoResizeCaption]);

  // Generate thumbnails from video
  const generateThumbnailsFromVideo = useCallback((videoFile: File) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.preload = 'metadata';
    const captureFrame = (time: number): Promise<string> => {
      return new Promise((resolve) => {
        video.currentTime = time;
        video.onseeked = () => {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth || 1280;
          canvas.height = video.videoHeight || 720;
          const ctx = canvas.getContext('2d');
          if (ctx) { ctx.drawImage(video, 0, 0, canvas.width, canvas.height); resolve(canvas.toDataURL('image/jpeg', 0.85)); }
          else resolve('');
        };
      });
    };
    video.onloadedmetadata = async () => {
      const duration = video.duration;
      const times = [duration * 0.1, duration * 0.25, duration * 0.5, duration * 0.75];
      const thumbnails: string[] = [];
      for (const time of times) { const thumb = await captureFrame(time); if (thumb) thumbnails.push(thumb); }
      setGeneratedThumbnails(thumbnails);
      if (thumbnails.length > 0) { setSelectedThumbnailIndex(0); setThumbnailPreview(thumbnails[0]); }
      URL.revokeObjectURL(video.src);
    };
    video.src = URL.createObjectURL(videoFile);
    video.load();
  }, []);

  const handleAIVideoGenerated = useCallback(async (videoUrl: string, videoBlob: Blob) => {
    setShowAIVideoGenerator(false);
    const file = new File([videoBlob], `ai-video-${Date.now()}.mp4`, { type: 'video/mp4' });
    if (videoBlob.size === 0) {
      try { const response = await fetch(videoUrl); const fetchedBlob = await response.blob(); handleFileSelect(new File([fetchedBlob], `ai-video-${Date.now()}.mp4`, { type: 'video/mp4' })); }
      catch (err) { console.error('Error fetching AI video:', err); toast.error('Failed to load AI video'); }
    } else { handleFileSelect(file); }
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
    if (selectedFile.size > maxSize) { toast.error(`File too large`); return; }
    const url = URL.createObjectURL(selectedFile);
    setPreview(url); setFile(selectedFile);
    if (selectedFile.type.startsWith('video/')) {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        if (video.duration > 60) { setContentType('video'); generateThumbnailsFromVideo(selectedFile); }
        else setContentType('short');
        URL.revokeObjectURL(video.src);
      };
      video.src = url;
    } else { setContentType('post'); }
    contentSafety.reset(); setShowSafetyScanner(true);
  }, [contentSafety, generateThumbnailsFromVideo]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles) return;
    if (selectedFiles.length > 1) handleMultiFileSelect(Array.from(selectedFiles));
    else if (selectedFiles[0]) handleFileSelect(selectedFiles[0]);
  };

  const handleMultiFileSelect = useCallback((selectedFiles: File[]) => {
    const imageFiles = selectedFiles.filter(f => f.type.startsWith('image/'));
    if (imageFiles.length === 0) { toast.error('Please select image files'); return; }
    if (imageFiles.length > 10) { toast.error('Maximum 10 images'); return; }
    const urls = imageFiles.map(f => URL.createObjectURL(f));
    setFiles(imageFiles); setPreviews(urls); setFile(imageFiles[0]); setPreview(urls[0]); setContentType('post');
    contentSafety.reset(); setShowSafetyScanner(true);
  }, [contentSafety]);

  const removeFileAtIndex = useCallback((index: number) => {
    URL.revokeObjectURL(previews[index]);
    const newFiles = files.filter((_, i) => i !== index);
    const newPreviews = previews.filter((_, i) => i !== index);
    setFiles(newFiles); setPreviews(newPreviews);
    if (newFiles.length > 0) { setFile(newFiles[0]); setPreview(newPreviews[0]); }
    else { setFile(null); setPreview(null); }
  }, [files, previews]);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }, []);
  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 1) handleMultiFileSelect(droppedFiles);
    else if (droppedFiles[0]) handleFileSelect(droppedFiles[0]);
  }, [handleFileSelect, handleMultiFileSelect]);

  const handleSafetyContinue = () => setShowSafetyScanner(false);
  const handleSafetyCancel = () => { setShowSafetyScanner(false); clearFile(); contentSafety.reset(); };
  const handleSafetyAppeal = () => { contentSafety.submitAppeal(file?.type.startsWith('video/') ? 'video' : 'image', 'User appealed'); setShowSafetyScanner(false); };

  const handleAddTag = (tag: string) => {
    const cleanTag = tag.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
    if (cleanTag && !tags.includes(cleanTag) && tags.length < 10) { setTags([...tags, cleanTag]); setTagInput(''); }
  };
  const handleRemoveTag = (tagToRemove: string) => setTags(tags.filter(tag => tag !== tagToRemove));
  const handleTagInputKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); handleAddTag(tagInput); } };

  const handleThumbnailSelect = (index: number) => { setSelectedThumbnailIndex(index); setThumbnailPreview(generatedThumbnails[index]); setThumbnailFile(null); };
  const handleCustomThumbnail = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.type.startsWith('image/')) { toast.error('Please select an image'); return; }
      setThumbnailFile(selectedFile); setThumbnailPreview(URL.createObjectURL(selectedFile)); setSelectedThumbnailIndex(null);
    }
  };

  const handleSubmit = async () => {
    if (contentType !== 'text' && !file && files.length === 0) { toast.error('Please select a file'); return; }
    if (contentType === 'text' && !caption.trim()) { toast.error('Write something to share'); return; }
    if (!user) { toast.error('Please sign in first'); return; }
    if (contentType === 'video' && !videoTitle.trim()) { toast.error('Add a video title'); return; }
    setIsUploading(true); setUploadProgress(0);
    try {
      const progressInterval = setInterval(() => setUploadProgress(prev => Math.min(prev + 5, 90)), 300);
      const finalCaption = contentType === 'video' ? `${videoTitle}${videoDescription ? `\n\n${videoDescription}` : ''}${caption ? `\n\n${caption}` : ''}` : caption;
      await createPost.mutateAsync({
        mediaFile: files.length <= 1 ? file || undefined : undefined,
        mediaFiles: files.length > 1 ? files : undefined,
        caption: finalCaption, type: contentType, tags,
        thumbnailFile: thumbnailFile || undefined,
        thumbnailDataUrl: selectedThumbnailIndex !== null ? generatedThumbnails[selectedThumbnailIndex] : undefined,
      });
      clearInterval(progressInterval); setUploadProgress(100);
      toast.success('Posted!'); navigate('/home');
    } catch (error) { console.error('Upload error:', error); toast.error('Failed to upload'); }
    finally { setIsUploading(false); setUploadProgress(0); }
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

  if (showCamera) return <Camera onClose={() => setShowCamera(false)} />;
  if (showAIVideoGenerator) return <AIVideoGenerator onVideoGenerated={handleAIVideoGenerated} onClose={() => setShowAIVideoGenerator(false)} />;

  return (
    <AppLayout hideNav>
      {showSafetyScanner && file && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <ContentSafetyScanner isScanning={contentSafety.isScanning} result={contentSafety.result} message={contentSafety.message} scanDetails={contentSafety.scanDetails} onContinue={handleSafetyContinue} onCancel={handleSafetyCancel} onAppeal={handleSafetyAppeal} />
        </div>
      )}

      <div className="fixed inset-0 -z-10 bg-background" />

      <div className="max-w-lg mx-auto min-h-screen flex flex-col">
        {/* ── Header ── */}
        <div className="sticky top-0 z-40 flex items-center justify-between px-4 h-12 bg-background/80 backdrop-blur-2xl border-b border-border/20">
          <button onClick={() => navigate(-1)} className="text-sm font-medium text-foreground/70 hover:text-foreground transition-colors">
            Cancel
          </button>
          <span className="text-sm font-bold text-foreground tracking-tight">New post</span>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || isUploading}
            className={cn(
              "text-sm font-bold transition-colors",
              canSubmit && !isUploading ? "text-primary hover:text-primary/80" : "text-muted-foreground/40"
            )}
          >
            {isUploading ? `${uploadProgress}%` : 'Share'}
          </button>
        </div>

        {/* ── Upload progress ── */}
        <AnimatePresence>
          {isUploading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="h-0.5 bg-muted">
                <motion.div className="h-full bg-primary" style={{ width: `${uploadProgress}%` }} transition={{ ease: 'easeOut' }} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Type pills ── */}
        <div className="px-4 py-3 flex gap-2">
          {([
            { id: 'text' as const, icon: Type, label: 'Text' },
            { id: 'post' as const, icon: Image, label: 'Photo' },
            { id: 'short' as const, icon: Film, label: 'Clip' },
            { id: 'video' as const, icon: Video, label: 'Video' },
          ]).map((t) => {
            const active = contentType === t.id;
            return (
              <button
                key={t.id}
                onClick={() => { setContentType(t.id); if (t.id === 'text') clearFile(); }}
                className={cn(
                  "flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 border",
                  active
                    ? "bg-foreground text-background border-foreground shadow-sm"
                    : "bg-transparent text-muted-foreground border-border/40 hover:border-foreground/30 hover:text-foreground"
                )}
              >
                <t.icon className="w-3 h-3" />
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1 flex flex-col">
          {/* ── Composer row (avatar + caption) ── */}
          <div className="flex gap-3 px-4 py-2">
            {/* Avatar */}
            <div className="flex-shrink-0 pt-0.5">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/60 to-accent/60 p-[1.5px]">
                <div className="w-full h-full rounded-full overflow-hidden bg-background">
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
                      {profile?.username?.[0]?.toUpperCase() || '?'}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Caption */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground mb-0.5">{profile?.username || 'you'}</p>
              <textarea
                ref={captionRef}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder={
                  contentType === 'text' ? "What's happening?" :
                  contentType === 'video' ? "Describe your video..." :
                  "Write a caption..."
                }
                className={cn(
                  "w-full bg-transparent text-foreground placeholder:text-muted-foreground/50 resize-none outline-none leading-relaxed",
                  contentType === 'text' ? "text-base min-h-[100px]" : "text-sm min-h-[44px]"
                )}
                maxLength={2200}
                rows={1}
              />

              {/* ── Media preview (inline, below caption like Threads/Instagram) ── */}
              {contentType !== 'text' && (
                <div className="mt-2">
                  {/* Multi-image grid */}
                  {previews.length > 1 ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-3 gap-1.5 rounded-2xl overflow-hidden">
                        {previews.map((p, i) => (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: i * 0.04 }}
                            className={cn(
                              "relative aspect-square group",
                              i === 0 && previews.length === 2 && "col-span-2 row-span-2",
                              i === 0 && previews.length >= 3 && "col-span-2 row-span-2"
                            )}
                          >
                            <img src={p} alt="" className="w-full h-full object-cover" />
                            <button
                              onClick={() => removeFileAtIndex(i)}
                              className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="w-3 h-3 text-white" />
                            </button>
                            {i === previews.length - 1 && previews.length >= 4 && (
                              <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-sm">
                                <span className="text-[10px] font-medium text-white flex items-center gap-0.5">
                                  <Layers className="w-2.5 h-2.5" />{previews.length}
                                </span>
                              </div>
                            )}
                          </motion.div>
                        ))}
                      </div>
                      {previews.length < 10 && (
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="flex items-center gap-1.5 text-xs text-primary font-medium hover:text-primary/80 transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add more photos
                        </button>
                      )}
                    </div>
                  ) : preview ? (
                    /* Single file preview */
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="relative rounded-2xl overflow-hidden border border-border/20"
                    >
                      {file?.type.startsWith('video/') ? (
                        <video src={preview} className="w-full max-h-[55vh] object-contain bg-black/5 rounded-2xl" controls playsInline />
                      ) : (
                        <img src={preview} alt="" className="w-full max-h-[55vh] object-cover rounded-2xl" />
                      )}
                      <button
                        onClick={clearFile}
                        className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center hover:bg-black/70 transition-colors"
                      >
                        <X className="w-3.5 h-3.5 text-white" />
                      </button>
                    </motion.div>
                  ) : null}
                </div>
              )}

              {/* ── Toolbar row ── */}
              {contentType !== 'text' && !hasMedia && (
                <div className="flex items-center gap-1 mt-3 -ml-1">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-9 h-9 rounded-full flex items-center justify-center text-primary hover:bg-primary/10 transition-colors"
                  >
                    <Image className="w-[18px] h-[18px]" />
                  </button>
                  <button
                    onClick={() => setShowCamera(true)}
                    className="w-9 h-9 rounded-full flex items-center justify-center text-primary hover:bg-primary/10 transition-colors"
                  >
                    <CameraIcon className="w-[18px] h-[18px]" />
                  </button>
                  <button
                    onClick={() => setShowAIVideoGenerator(true)}
                    className="w-9 h-9 rounded-full flex items-center justify-center text-primary hover:bg-primary/10 transition-colors"
                  >
                    <Wand2 className="w-[18px] h-[18px]" />
                  </button>
                </div>
              )}

              {/* Drag-and-drop zone when no media */}
              {contentType !== 'text' && !hasMedia && (
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "mt-3 rounded-2xl border border-dashed p-6 text-center cursor-pointer transition-all",
                    isDragging
                      ? "border-primary bg-primary/5"
                      : "border-border/30 hover:border-border/60"
                  )}
                >
                  <UploadIcon className={cn("w-8 h-8 mx-auto mb-2", isDragging ? "text-primary" : "text-muted-foreground/40")} />
                  <p className="text-xs text-muted-foreground">
                    {isDragging ? 'Drop files here' : 'Drag photos & videos here'}
                  </p>
                  <p className="text-[10px] text-muted-foreground/50 mt-1">Up to 10 images per carousel</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Divider ── */}
          <div className="mx-4 border-t border-border/15 my-1" />

          {/* ── Tags & extras ── */}
          <div className="px-4 py-2 space-y-3">
            {/* AI caption */}
            <div className="flex items-center justify-between">
              <AICaptionGenerator tags={tags} contentType={contentType === 'text' ? 'post' : contentType} onSelectCaption={setCaption} />
              <span className="text-[10px] text-muted-foreground/50 tabular-nums">{caption.length}/2200</span>
            </div>

            {/* Tags */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {tags.map((tag) => (
                  <motion.span
                    key={tag}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-xs font-medium cursor-pointer hover:bg-destructive/15 hover:text-destructive transition-colors"
                    onClick={() => handleRemoveTag(tag)}
                  >
                    #{tag}
                    <X className="w-2.5 h-2.5" />
                  </motion.span>
                ))}
                <div className="flex-1 min-w-[120px]">
                  <input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleTagInputKeyDown}
                    placeholder={tags.length === 0 ? "Add tags..." : "Add more..."}
                    className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground/40 outline-none py-1"
                    maxLength={30}
                  />
                </div>
              </div>
              {tags.length === 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {suggestedTags.slice(0, 6).map((tag) => (
                    <button
                      key={tag}
                      onClick={() => handleAddTag(tag)}
                      className="text-[11px] px-2.5 py-1 rounded-lg border border-border/30 text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
                    >
                      #{tag}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Video details ── */}
          {contentType === 'video' && file && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mx-4 mt-2 space-y-3 p-4 rounded-2xl border border-border/20 bg-muted/20">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <Video className="w-3.5 h-3.5 text-primary" />
                Video details
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Title</Label>
                <Input value={videoTitle} onChange={(e) => setVideoTitle(e.target.value)} placeholder="Video title" className="h-8 text-sm bg-transparent border-border/30" maxLength={100} />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Description</Label>
                <textarea
                  value={videoDescription}
                  onChange={(e) => setVideoDescription(e.target.value)}
                  placeholder="Tell viewers about your video..."
                  className="w-full min-h-[60px] bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 resize-none outline-none border border-border/30 rounded-xl px-3 py-2"
                  maxLength={5000}
                />
              </div>
              {generatedThumbnails.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Thumbnail</Label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {generatedThumbnails.map((thumb, index) => (
                      <button key={index} onClick={() => handleThumbnailSelect(index)}
                        className={cn("relative aspect-video rounded-lg overflow-hidden border-2 transition-all", selectedThumbnailIndex === index ? "border-primary ring-1 ring-primary/20" : "border-transparent hover:border-primary/30")}>
                        <img src={thumb} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                    <button onClick={() => thumbnailInputRef.current?.click()}
                      className="aspect-video rounded-lg border-2 border-dashed border-border/30 flex flex-col items-center justify-center hover:border-primary/30 transition-colors">
                      <ImagePlus className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-[9px] text-muted-foreground mt-0.5">Custom</span>
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </div>

        <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple onChange={handleInputChange} className="hidden" />
        <input ref={thumbnailInputRef} type="file" accept="image/*" onChange={handleCustomThumbnail} className="hidden" />
      </div>
    </AppLayout>
  );
}
