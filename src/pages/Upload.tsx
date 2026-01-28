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
import { Image, Video, Film, X, Plus, Camera as CameraIcon, Upload as UploadIcon, Wand2, ImagePlus } from 'lucide-react';
import { Label } from '@/components/ui/label';

const contentTypes = [
  { id: 'post', label: 'Post', icon: Image, description: 'Share a photo' },
  { id: 'short', label: 'Clip', icon: Film, description: 'Quick vertical video' },
  { id: 'video', label: 'Video', icon: Video, description: 'Longer video content' },
];

const suggestedTags = ['photography', 'art', 'music', 'gaming', 'food', 'travel', 'fashion', 'fitness', 'ai'];

export default function UploadPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const createPost = useCreatePost();
  const contentSafety = useContentSafety();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [contentType, setContentType] = useState<'post' | 'short' | 'video'>('post');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
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
      const times = [
        duration * 0.1,
        duration * 0.25,
        duration * 0.5,
        duration * 0.75,
      ];
      
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

  // Run safety scan when file is selected
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
    // Allow larger files for long-form video (2GB max for unlimited duration)
    const maxSize = selectedFile.type.startsWith('video/') ? 2 * 1024 * 1024 * 1024 : 50 * 1024 * 1024;
    if (selectedFile.size > maxSize) {
      toast.error(`File too large. Maximum size is ${selectedFile.type.startsWith('video/') ? '2GB' : '50MB'}.`);
      return;
    }
    const url = URL.createObjectURL(selectedFile);
    setPreview(url);
    setFile(selectedFile);
    
    if (selectedFile.type.startsWith('video/')) {
      // Auto-detect: short clips vs long-form based on duration
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        const duration = video.duration;
        // If video is longer than 60 seconds, treat as long-form
        if (duration > 60) {
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
    const selectedFile = e.target.files?.[0];
    if (selectedFile) handleFileSelect(selectedFile);
  };

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
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) handleFileSelect(droppedFile);
  }, [handleFileSelect]);

  const handleSafetyContinue = () => setShowSafetyScanner(false);
  const handleSafetyCancel = () => { 
    setShowSafetyScanner(false); 
    clearFile(); 
    contentSafety.reset();
  };
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
    setThumbnailFile(null); // Clear custom thumbnail
  };

  const handleCustomThumbnail = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.type.startsWith('image/')) {
        toast.error('Please select an image file');
        return;
      }
      const url = URL.createObjectURL(selectedFile);
      setThumbnailFile(selectedFile);
      setThumbnailPreview(url);
      setSelectedThumbnailIndex(null);
    }
  };

  const handleSubmit = async () => {
    if (!file || !user) { toast.error('Please select a file to upload'); return; }
    
    // For long-form videos, require a title
    if (contentType === 'video' && !videoTitle.trim()) {
      toast.error('Please add a title for your video');
      return;
    }
    
    setIsUploading(true);
    setUploadProgress(0);
    try {
      const progressInterval = setInterval(() => setUploadProgress(prev => Math.min(prev + 5, 90)), 300);
      
      // Combine title and description into caption for long-form videos
      const finalCaption = contentType === 'video' 
        ? `${videoTitle}${videoDescription ? `\n\n${videoDescription}` : ''}${caption ? `\n\n${caption}` : ''}`
        : caption;
      
      await createPost.mutateAsync({ 
        mediaFile: file, 
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
    if (thumbnailPreview && !generatedThumbnails.includes(thumbnailPreview)) {
      URL.revokeObjectURL(thumbnailPreview);
    }
    setFile(null);
    setPreview(null);
    setVideoTitle('');
    setVideoDescription('');
    setThumbnailFile(null);
    setThumbnailPreview(null);
    setGeneratedThumbnails([]);
    setSelectedThumbnailIndex(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (thumbnailInputRef.current) thumbnailInputRef.current.value = '';
  };

  // Camera and AI Video Generator are fullscreen overlays - no bottom nav needed
  if (showCamera) return <Camera onClose={() => setShowCamera(false)} />;

  if (showAIVideoGenerator) {
    return (
      <AIVideoGenerator 
        onVideoGenerated={handleAIVideoGenerated}
        onClose={() => setShowAIVideoGenerator(false)}
      />
    );
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
      <div className="max-w-2xl mx-auto p-4 pb-24 space-y-6">
        <h1 className="text-2xl font-bold">Create Post</h1>
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">Content Type</label>
          <div className="grid grid-cols-3 gap-2">
            {contentTypes.map((type) => (
              <button key={type.id} onClick={() => setContentType(type.id as 'post' | 'short' | 'video')}
                className={`p-3 rounded-xl border-2 transition-all ${contentType === type.id ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}>
                <type.icon className={`w-6 h-6 mx-auto mb-1 ${contentType === type.id ? 'text-primary' : 'text-muted-foreground'}`} />
                <p className={`text-sm font-medium ${contentType === type.id ? 'text-primary' : 'text-foreground'}`}>{type.label}</p>
                <p className="text-xs text-muted-foreground">{type.description}</p>
              </button>
            ))}
          </div>
        </div>
        
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">Media</label>
          {preview ? (
            <div className="relative rounded-xl overflow-hidden bg-muted">
              {file?.type.startsWith('video/') ? (
                <video 
                  src={preview} 
                  className="w-full max-h-[60vh] object-contain mx-auto"
                  controls 
                  playsInline
                />
              ) : (
                <img src={preview} alt="Preview" className="w-full max-h-96 object-contain" />
              )}
              <button onClick={clearFile} className="absolute top-2 right-2 p-2 rounded-full bg-background/80 hover:bg-background"><X className="w-4 h-4" /></button>
            </div>
          ) : (
            <div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${isDragging ? 'border-primary bg-primary/10 scale-[1.02]' : 'border-border hover:border-primary/50'}`}>
              <UploadIcon className={`w-12 h-12 mx-auto mb-4 ${isDragging ? 'text-primary' : 'text-muted-foreground'}`} />
              <p className={`text-lg font-medium mb-2 ${isDragging ? 'text-primary' : 'text-foreground'}`}>{isDragging ? 'Drop to upload' : 'Drag and drop your file here'}</p>
              <p className="text-sm text-muted-foreground mb-4">or click to browse</p>
              <div className="flex flex-wrap gap-2 justify-center" onClick={(e) => e.stopPropagation()}>
                <Button variant="outline" onClick={() => fileInputRef.current?.click()}><Plus className="w-4 h-4 mr-2" />Choose File</Button>
                <Button variant="outline" onClick={() => setShowCamera(true)}><CameraIcon className="w-4 h-4 mr-2" />Camera</Button>
                <Button variant="outline" onClick={() => setShowAIVideoGenerator(true)} className="bg-primary/10 border-primary/30 hover:border-primary/50">
                  <Wand2 className="w-4 h-4 mr-2 text-primary" />AI Video
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-4">Supports: JPG, PNG, GIF, WebP, MP4, WebM • Videos up to 2GB, no duration limit</p>
            </div>
          )}
          <input ref={fileInputRef} type="file" accept="image/*,video/*" onChange={handleInputChange} className="hidden" />
          <input ref={thumbnailInputRef} type="file" accept="image/*" onChange={handleCustomThumbnail} className="hidden" />
        </div>
        
        {/* Long-form video details */}
        {contentType === 'video' && file && (
          <div className="space-y-4 p-4 rounded-xl bg-muted/50 border border-border">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <Video className="w-4 h-4" />
              Video Details
            </h3>
            
            {/* Title */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Title *</Label>
              <Input 
                value={videoTitle} 
                onChange={(e) => setVideoTitle(e.target.value)} 
                placeholder="Add a title that describes your video"
                maxLength={100}
              />
              <span className="text-xs text-muted-foreground">{videoTitle.length}/100</span>
            </div>
            
            {/* Description */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Description</Label>
              <Textarea 
                value={videoDescription} 
                onChange={(e) => setVideoDescription(e.target.value)} 
                placeholder="Tell viewers about your video..."
                className="min-h-20 resize-none"
                maxLength={5000}
              />
              <span className="text-xs text-muted-foreground">{videoDescription.length}/5000</span>
            </div>
            
            {/* Thumbnail Selection */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Thumbnail</Label>
              <p className="text-xs text-muted-foreground">Select a thumbnail or upload your own</p>
              
              <div className="grid grid-cols-4 gap-2">
                {generatedThumbnails.map((thumb, index) => (
                  <button
                    key={index}
                    onClick={() => handleThumbnailSelect(index)}
                    className={`relative aspect-video rounded-lg overflow-hidden border-2 transition-all ${
                      selectedThumbnailIndex === index ? 'border-primary ring-2 ring-primary/30' : 'border-transparent hover:border-primary/50'
                    }`}
                  >
                    <img src={thumb} alt={`Thumbnail ${index + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
                
                {/* Custom thumbnail upload */}
                <button
                  onClick={() => thumbnailInputRef.current?.click()}
                  className={`relative aspect-video rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1 transition-all ${
                    thumbnailFile ? 'border-primary bg-primary/10' : 'border-muted-foreground/30 hover:border-primary/50'
                  }`}
                >
                  {thumbnailFile && thumbnailPreview ? (
                    <img src={thumbnailPreview} alt="Custom thumbnail" className="absolute inset-0 w-full h-full object-cover rounded-lg" />
                  ) : (
                    <>
                      <ImagePlus className="w-5 h-5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Upload</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
        
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">
            {contentType === 'video' ? 'Additional Notes' : 'Caption'}
          </label>
          <Textarea 
            value={caption} 
            onChange={(e) => setCaption(e.target.value)} 
            placeholder={contentType === 'video' ? "Add any additional notes or hashtags..." : "Write a caption..."} 
            className="min-h-24 resize-none" 
            maxLength={2200} 
          />
          <div className="flex items-center justify-between">
            <AICaptionGenerator tags={tags} contentType={contentType} onSelectCaption={setCaption} />
            <span className="text-xs text-muted-foreground">{caption.length}/2200</span>
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">Tags</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {tags.map((tag) => (<Badge key={tag} variant="secondary" className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground" onClick={() => handleRemoveTag(tag)}>#{tag} <X className="w-3 h-3 ml-1" /></Badge>))}
          </div>
          <Input value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={handleTagInputKeyDown} placeholder="Add tags (press Enter)" maxLength={30} />
          <div className="flex flex-wrap gap-1 mt-2">
            {suggestedTags.filter(tag => !tags.includes(tag)).slice(0, 6).map((tag) => (<Badge key={tag} variant="outline" className="cursor-pointer hover:bg-primary/10" onClick={() => handleAddTag(tag)}>#{tag}</Badge>))}
          </div>
        </div>
        {isUploading && (<div className="space-y-2"><Progress value={uploadProgress} className="h-2" /><p className="text-sm text-center text-muted-foreground">Uploading... {uploadProgress}%</p></div>)}
        <Button onClick={handleSubmit} disabled={!file || isUploading} className="w-full" size="lg">{isUploading ? 'Uploading...' : 'Share'}</Button>
      </div>
    </AppLayout>
  );
}