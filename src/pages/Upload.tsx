import { useState, useCallback, useRef, useEffect, DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
  Hash, Sparkles, Send, GripVertical
} from 'lucide-react';
import { useIsMobileOrTablet } from '@/hooks/use-mobile';
import { Label } from '@/components/ui/label';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

const contentTypes = [
  { id: 'text', label: 'Text', icon: Type, accent: 'from-blue-500/20 to-cyan-500/20' },
  { id: 'post', label: 'Photo', icon: Image, accent: 'from-pink-500/20 to-rose-500/20' },
  { id: 'short', label: 'Clip', icon: Film, accent: 'from-purple-500/20 to-violet-500/20' },
  { id: 'video', label: 'Video', icon: Video, accent: 'from-amber-500/20 to-orange-500/20' },
] as const;

const suggestedTags = ['photography', 'art', 'music', 'gaming', 'food', 'travel', 'fashion', 'fitness', 'ai'];

export default function UploadPage() {
  const { isMobileOrTablet } = useIsMobileOrTablet();
  const navigate = useNavigate();
  const { user } = useAuth();
  const createPost = useCreatePost();
  const contentSafety = useContentSafety();
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  const [showTagInput, setShowTagInput] = useState(false);

  // Long-form video specific fields
  const [videoTitle, setVideoTitle] = useState('');
  const [videoDescription, setVideoDescription] = useState('');
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [generatedThumbnails, setGeneratedThumbnails] = useState<string[]>([]);
  const [selectedThumbnailIndex, setSelectedThumbnailIndex] = useState<number | null>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);

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
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', 0.85));
          } else {
            resolve('');
          }
        };
      });
    };

    video.onloadedmetadata = async () => {
      const duration = video.duration;
      const times = [duration * 0.1, duration * 0.25, duration * 0.5, duration * 0.75];
      const thumbnails: string[] = [];
      for (const time of times) {
        const thumb = await captureFrame(time);
        if (thumb) thumbnails.push(thumb);
      }
      setGeneratedThumbnails(thumbnails);
      if (thumbnails.length > 0) {
        setSelectedThumbnailIndex(0);
        setThumbnailPreview(thumbnails[0]);
      }
      URL.revokeObjectURL(video.src);
    };

    video.src = URL.createObjectURL(videoFile);
    video.load();
  }, []);

  const handleAIVideoGenerated = useCallback(async (videoUrl: string, videoBlob: Blob) => {
    setShowAIVideoGenerator(false);
    const file = new File([videoBlob], `ai-video-${Date.now()}.mp4`, { type: 'video/mp4' });
    if (videoBlob.size === 0) {
      try {
        const response = await fetch(videoUrl);
        const fetchedBlob = await response.blob();
        const fetchedFile = new File([fetchedBlob], `ai-video-${Date.now()}.mp4`, { type: 'video/mp4' });
        handleFileSelect(fetchedFile);
      } catch (err) {
        console.error('Error fetching AI video:', err);
        toast.error('Failed to load AI video');
      }
    } else {
      handleFileSelect(file);
    }
    if (!tags.includes('ai')) {
      setTags(prev => [...prev, 'ai']);
    }
  }, [tags]);

  useEffect(() => {
    if (file && showSafetyScanner) {
      if (file.type.startsWith('video/')) {
        contentSafety.scanVideo(file);
      } else {
        contentSafety.scanImage(file);
      }
    }
  }, [file, showSafetyScanner]);

  const handleFileSelect = useCallback((selectedFile: File) => {
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime'];
    if (!validTypes.includes(selectedFile.type)) {
      toast.error('Invalid file type. Please upload an image or video.');
      return;
    }
    const maxSize = selectedFile.type.startsWith('video/') ? 2 * 1024 * 1024 * 1024 : 50 * 1024 * 1024;
    if (selectedFile.size > maxSize) {
      toast.error(`File too large. Maximum size is ${selectedFile.type.startsWith('video/') ? '2GB' : '50MB'}.`);
      return;
    }
    const url = URL.createObjectURL(selectedFile);
    setPreview(url);
    setFile(selectedFile);
    if (selectedFile.type.startsWith('video/')) {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        if (video.duration > 60) {
          setContentType('video');
          generateThumbnailsFromVideo(selectedFile);
        } else {
          setContentType('short');
        }
        URL.revokeObjectURL(video.src);
      };
      video.src = url;
    } else {
      setContentType('post');
    }
    contentSafety.reset();
    setShowSafetyScanner(true);
  }, [contentSafety, generateThumbnailsFromVideo]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles) return;
    if (selectedFiles.length > 1) {
      handleMultiFileSelect(Array.from(selectedFiles));
    } else if (selectedFiles[0]) {
      handleFileSelect(selectedFiles[0]);
    }
  };

  const handleMultiFileSelect = useCallback((selectedFiles: File[]) => {
    const imageFiles = selectedFiles.filter(f => f.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      toast.error('Please select image files for carousel posts');
      return;
    }
    if (imageFiles.length > 10) {
      toast.error('Maximum 10 images per post');
      return;
    }
    const urls = imageFiles.map(f => URL.createObjectURL(f));
    setFiles(imageFiles);
    setPreviews(urls);
    setFile(imageFiles[0]);
    setPreview(urls[0]);
    setContentType('post');
    contentSafety.reset();
    setShowSafetyScanner(true);
  }, [contentSafety]);

  const removeFileAtIndex = useCallback((index: number) => {
    URL.revokeObjectURL(previews[index]);
    const newFiles = files.filter((_, i) => i !== index);
    const newPreviews = previews.filter((_, i) => i !== index);
    setFiles(newFiles);
    setPreviews(newPreviews);
    if (newFiles.length > 0) {
      setFile(newFiles[0]);
      setPreview(newPreviews[0]);
    } else {
      setFile(null);
      setPreview(null);
    }
  }, [files, previews]);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 1) {
      handleMultiFileSelect(droppedFiles);
    } else if (droppedFiles[0]) {
      handleFileSelect(droppedFiles[0]);
    }
  }, [handleFileSelect, handleMultiFileSelect]);

  const handleSafetyContinue = () => setShowSafetyScanner(false);
  const handleSafetyCancel = () => { setShowSafetyScanner(false); clearFile(); contentSafety.reset(); };
  const handleSafetyAppeal = () => {
    contentSafety.submitAppeal(file?.type.startsWith('video/') ? 'video' : 'image', 'User appealed content decision');
    setShowSafetyScanner(false);
  };

  const handleAddTag = (tag: string) => {
    const cleanTag = tag.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
    if (cleanTag && !tags.includes(cleanTag) && tags.length < 10) {
      setTags([...tags, cleanTag]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => setTags(tags.filter(tag => tag !== tagToRemove));

  const handleTagInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); handleAddTag(tagInput); }
  };

  const handleThumbnailSelect = (index: number) => {
    setSelectedThumbnailIndex(index);
    setThumbnailPreview(generatedThumbnails[index]);
    setThumbnailFile(null);
  };

  const handleCustomThumbnail = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.type.startsWith('image/')) { toast.error('Please select an image file'); return; }
      const url = URL.createObjectURL(selectedFile);
      setThumbnailFile(selectedFile);
      setThumbnailPreview(url);
      setSelectedThumbnailIndex(null);
    }
  };

  const handleSubmit = async () => {
    if (contentType !== 'text' && !file && files.length === 0) { toast.error('Please select a file to upload'); return; }
    if (contentType === 'text' && !caption.trim()) { toast.error('Please write something to share'); return; }
    if (!user) { toast.error('Please sign in first'); return; }
    if (contentType === 'video' && !videoTitle.trim()) { toast.error('Please add a title for your video'); return; }

    setIsUploading(true);
    setUploadProgress(0);
    try {
      const progressInterval = setInterval(() => setUploadProgress(prev => Math.min(prev + 5, 90)), 300);
      const finalCaption = contentType === 'video'
        ? `${videoTitle}${videoDescription ? `\n\n${videoDescription}` : ''}${caption ? `\n\n${caption}` : ''}`
        : caption;

      await createPost.mutateAsync({
        mediaFile: files.length <= 1 ? file || undefined : undefined,
        mediaFiles: files.length > 1 ? files : undefined,
        caption: finalCaption,
        type: contentType,
        tags,
        thumbnailFile: thumbnailFile || undefined,
        thumbnailDataUrl: selectedThumbnailIndex !== null ? generatedThumbnails[selectedThumbnailIndex] : undefined,
      });

      clearInterval(progressInterval);
      setUploadProgress(100);
      toast.success('Posted successfully!');
      navigate('/home');
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload. Please try again.');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const clearFile = () => {
    if (preview) URL.revokeObjectURL(preview);
    previews.forEach(p => URL.revokeObjectURL(p));
    if (thumbnailPreview && !generatedThumbnails.includes(thumbnailPreview)) URL.revokeObjectURL(thumbnailPreview);
    setFile(null);
    setFiles([]);
    setPreview(null);
    setPreviews([]);
    setVideoTitle('');
    setVideoDescription('');
    setThumbnailFile(null);
    setThumbnailPreview(null);
    setGeneratedThumbnails([]);
    setSelectedThumbnailIndex(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (thumbnailInputRef.current) thumbnailInputRef.current.value = '';
  };

  const hasMedia = file !== null || files.length > 0;
  const canSubmit = contentType === 'text' ? caption.trim().length > 0 : hasMedia;

  if (showCamera) return <Camera onClose={() => setShowCamera(false)} />;
  if (showAIVideoGenerator) {
    return <AIVideoGenerator onVideoGenerated={handleAIVideoGenerated} onClose={() => setShowAIVideoGenerator(false)} />;
  }

  return (
    <AppLayout hideNav>
      {showSafetyScanner && file && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <ContentSafetyScanner
            isScanning={contentSafety.isScanning}
            result={contentSafety.result}
            message={contentSafety.message}
            scanDetails={contentSafety.scanDetails}
            onContinue={handleSafetyContinue}
            onCancel={handleSafetyCancel}
            onAppeal={handleSafetyAppeal}
          />
        </div>
      )}

      <div className="fixed inset-0 -z-10 bg-background/70 backdrop-blur-xl" />

      <div className="max-w-lg mx-auto min-h-screen flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-40 px-4 py-3 flex items-center justify-between bg-background/60 backdrop-blur-xl border-b border-border/30">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full liquid-glass flex items-center justify-center"
          >
            <ArrowLeft className="w-4 h-4 text-foreground" />
          </button>
          <h1 className="text-base font-semibold text-foreground">Create</h1>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || isUploading}
            size="sm"
            className="rounded-full px-5 h-9 font-semibold"
          >
            {isUploading ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                {uploadProgress}%
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <Send className="w-3.5 h-3.5" />
                Post
              </span>
            )}
          </Button>
        </div>

        {/* Upload progress bar */}
        <AnimatePresence>
          {isUploading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Progress value={uploadProgress} className="h-0.5 rounded-none" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Content type selector — pill style */}
        <div className="px-4 pt-4 pb-2">
          <div className="flex gap-1.5 p-1 rounded-2xl liquid-glass">
            {contentTypes.map((type) => {
              const isActive = contentType === type.id;
              return (
                <button
                  key={type.id}
                  onClick={() => { setContentType(type.id as any); if (type.id === 'text') clearFile(); }}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-medium transition-all duration-200",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                  )}
                >
                  <type.icon className="w-3.5 h-3.5" />
                  {type.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Main content area */}
        <div className="flex-1 px-4 space-y-4 pb-8">

          {/* Caption / Text area — always visible, prominent for text posts */}
          <div className="relative">
            <Textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder={
                contentType === 'text' ? "What's on your mind?" :
                contentType === 'video' ? "Describe your video..." :
                "Write a caption..."
              }
              className={cn(
                "resize-none border-0 bg-transparent px-1 text-foreground placeholder:text-muted-foreground/60 focus-visible:ring-0 focus-visible:ring-offset-0",
                contentType === 'text' ? "min-h-[140px] text-lg" : "min-h-[80px] text-base"
              )}
              maxLength={2200}
            />
            <div className="flex items-center justify-between px-1 pt-1">
              <div className="flex items-center gap-1">
                <AICaptionGenerator
                  tags={tags}
                  contentType={contentType === 'text' ? 'post' : contentType}
                  onSelectCaption={setCaption}
                />
                <button
                  onClick={() => setShowTagInput(!showTagInput)}
                  className={cn(
                    "h-7 px-2.5 rounded-lg text-xs flex items-center gap-1 transition-colors",
                    showTagInput || tags.length > 0
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                  )}
                >
                  <Hash className="w-3 h-3" />
                  Tags{tags.length > 0 && ` (${tags.length})`}
                </button>
              </div>
              <span className="text-[10px] text-muted-foreground tabular-nums">{caption.length}/2200</span>
            </div>
          </div>

          {/* Tags section */}
          <AnimatePresence>
            {(showTagInput || tags.length > 0) && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="space-y-2 p-3 rounded-2xl liquid-glass">
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {tags.map((tag) => (
                        <Badge
                          key={tag}
                          variant="secondary"
                          className="cursor-pointer hover:bg-destructive/20 hover:text-destructive text-xs py-0.5 rounded-lg"
                          onClick={() => handleRemoveTag(tag)}
                        >
                          #{tag} <X className="w-2.5 h-2.5 ml-1" />
                        </Badge>
                      ))}
                    </div>
                  )}
                  <Input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleTagInputKeyDown}
                    placeholder="Add a tag..."
                    className="h-8 text-xs bg-transparent border-0 px-0 focus-visible:ring-0"
                    maxLength={30}
                  />
                  <div className="flex flex-wrap gap-1">
                    {suggestedTags.filter(tag => !tags.includes(tag)).slice(0, 5).map((tag) => (
                      <button
                        key={tag}
                        onClick={() => handleAddTag(tag)}
                        className="text-[11px] px-2 py-0.5 rounded-md bg-muted/50 text-muted-foreground hover:bg-primary/15 hover:text-primary transition-colors"
                      >
                        #{tag}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Media area */}
          {contentType !== 'text' && (
            <div className="space-y-3">
              {/* Multi-image carousel preview */}
              {previews.length > 1 ? (
                <div className="space-y-2">
                  <div className="flex gap-2 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide">
                    {previews.map((p, i) => (
                      <motion.div
                        key={i}
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: i * 0.05 }}
                        className="relative flex-shrink-0 w-28 h-28 rounded-xl overflow-hidden snap-start group"
                      >
                        <img src={p} alt="" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        <button
                          onClick={() => removeFileAtIndex(i)}
                          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3 text-white" />
                        </button>
                        <span className="absolute bottom-1 left-1 text-[10px] font-bold text-white/90 bg-black/40 px-1.5 py-0.5 rounded-md">
                          {i + 1}
                        </span>
                      </motion.div>
                    ))}
                    {/* Add more button */}
                    {previews.length < 10 && (
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="flex-shrink-0 w-28 h-28 rounded-xl border-2 border-dashed border-border/50 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
                      >
                        <Plus className="w-5 h-5" />
                        <span className="text-[10px]">Add</span>
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground text-center">
                    {previews.length} photos · carousel post
                  </p>
                </div>
              ) : preview ? (
                /* Single file preview */
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="relative rounded-2xl overflow-hidden liquid-glass"
                >
                  {file?.type.startsWith('video/') ? (
                    <video src={preview} className="w-full max-h-[50vh] object-contain bg-black/20" controls playsInline />
                  ) : (
                    <img src={preview} alt="Preview" className="w-full max-h-[50vh] object-contain" />
                  )}
                  <button
                    onClick={clearFile}
                    className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center hover:bg-black/70 transition-colors"
                  >
                    <X className="w-4 h-4 text-white" />
                  </button>
                </motion.div>
              ) : (
                /* Upload zone */
                <motion.div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  whileTap={{ scale: 0.98 }}
                  className={cn(
                    "rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition-all duration-200",
                    isDragging
                      ? "border-primary bg-primary/10 scale-[1.01]"
                      : "border-border/40 hover:border-primary/40 liquid-glass"
                  )}
                >
                  <motion.div
                    animate={isDragging ? { scale: 1.1, y: -4 } : { scale: 1, y: 0 }}
                    className="flex flex-col items-center"
                  >
                    <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
                      <UploadIcon className="w-6 h-6 text-primary" />
                    </div>
                    <p className="text-sm font-medium text-foreground mb-1">
                      {isDragging ? 'Drop to upload' : 'Add media'}
                    </p>
                    <p className="text-xs text-muted-foreground mb-4">
                      Drag & drop or tap to browse
                    </p>
                  </motion.div>

                  <div className="flex gap-2 justify-center" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="glass"
                      size="sm"
                      className="rounded-xl text-xs h-8"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Files
                    </Button>
                    <Button
                      variant="glass"
                      size="sm"
                      className="rounded-xl text-xs h-8"
                      onClick={() => setShowCamera(true)}
                    >
                      <CameraIcon className="w-3 h-3 mr-1" />
                      Camera
                    </Button>
                    <Button
                      variant="glass"
                      size="sm"
                      className="rounded-xl text-xs h-8 text-primary"
                      onClick={() => setShowAIVideoGenerator(true)}
                    >
                      <Wand2 className="w-3 h-3 mr-1" />
                      AI
                    </Button>
                  </div>

                  <p className="text-[10px] text-muted-foreground/60 mt-3">
                    Up to 10 images · JPG, PNG, GIF, WebP, MP4
                  </p>
                </motion.div>
              )}
              <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple onChange={handleInputChange} className="hidden" />
              <input ref={thumbnailInputRef} type="file" accept="image/*" onChange={handleCustomThumbnail} className="hidden" />
            </div>
          )}

          {/* Video-specific details */}
          {contentType === 'video' && file && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3 p-4 rounded-2xl liquid-glass"
            >
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Video className="w-4 h-4 text-primary" />
                Video Details
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Title *</Label>
                <Input
                  value={videoTitle}
                  onChange={(e) => setVideoTitle(e.target.value)}
                  placeholder="Give your video a title"
                  className="h-9 text-sm"
                  maxLength={100}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Description</Label>
                <Textarea
                  value={videoDescription}
                  onChange={(e) => setVideoDescription(e.target.value)}
                  placeholder="Tell viewers about your video..."
                  className="min-h-16 resize-none text-sm"
                  maxLength={5000}
                />
              </div>

              {generatedThumbnails.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Thumbnail</Label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {generatedThumbnails.map((thumb, index) => (
                      <button
                        key={index}
                        onClick={() => handleThumbnailSelect(index)}
                        className={cn(
                          "relative aspect-video rounded-lg overflow-hidden border-2 transition-all",
                          selectedThumbnailIndex === index
                            ? "border-primary ring-1 ring-primary/30"
                            : "border-transparent hover:border-primary/40"
                        )}
                      >
                        <img src={thumb} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                    <button
                      onClick={() => thumbnailInputRef.current?.click()}
                      className="aspect-video rounded-lg border-2 border-dashed border-border/40 flex flex-col items-center justify-center gap-0.5 hover:border-primary/40 transition-colors"
                    >
                      <ImagePlus className="w-4 h-4 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground">Custom</span>
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
