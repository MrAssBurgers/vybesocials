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
import { Image, Video, Film, X, Plus, Camera as CameraIcon, Upload as UploadIcon, Wand2 } from 'lucide-react';

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

  const handleAIVideoGenerated = useCallback(async (videoUrl: string, videoBlob: Blob) => {
    setShowAIVideoGenerator(false);
    
    // Create a File from the blob
    const file = new File([videoBlob], `ai-video-${Date.now()}.mp4`, { type: 'video/mp4' });
    
    // If blob is empty, fetch from URL
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
    
    // Add AI tag automatically
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
    if (selectedFile.size > 50 * 1024 * 1024) {
      toast.error('File too large. Maximum size is 50MB.');
      return;
    }
    const url = URL.createObjectURL(selectedFile);
    setPreview(url);
    setFile(selectedFile);
    if (selectedFile.type.startsWith('video/')) {
      setContentType('short');
    } else {
      setContentType('post');
    }
    contentSafety.reset();
    setShowSafetyScanner(true);
  }, [contentSafety]);

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

  const handleSubmit = async () => {
    if (!file || !user) { toast.error('Please select a file to upload'); return; }
    setIsUploading(true);
    setUploadProgress(0);
    try {
      const progressInterval = setInterval(() => setUploadProgress(prev => Math.min(prev + 10, 90)), 200);
      await createPost.mutateAsync({ mediaFile: file, caption, type: contentType, tags });
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
    setFile(null);
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
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
              {file?.type.startsWith('video/') ? <video src={preview} className="w-full max-h-96 object-contain" controls /> : <img src={preview} alt="Preview" className="w-full max-h-96 object-contain" />}
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
                <Button variant="outline" onClick={() => setShowAIVideoGenerator(true)} className="bg-gradient-to-r from-violet-500/10 to-purple-500/10 border-violet-500/30 hover:border-violet-500/50">
                  <Wand2 className="w-4 h-4 mr-2 text-violet-500" />AI Video
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-4">Supports: JPG, PNG, GIF, WebP, MP4, WebM (max 50MB)</p>
            </div>
          )}
          <input ref={fileInputRef} type="file" accept="image/*,video/*" onChange={handleInputChange} className="hidden" />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">Caption</label>
          <Textarea value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Write a caption..." className="min-h-24 resize-none" maxLength={2200} />
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