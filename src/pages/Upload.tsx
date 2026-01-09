import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Upload, X, Image, Film, Video, Hash, Camera as CameraIcon } from 'lucide-react';
import { useCreatePost } from '@/hooks/usePosts';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { getUserFriendlyError } from '@/lib/errorUtils';
import { Progress } from '@/components/ui/progress';
import { AICaptionGenerator } from '@/components/ai/AICaptionGenerator';
import { Camera } from '@/components/camera';

const contentTypes = [
  { value: 'post', label: 'Photo Post', icon: Image, description: 'Share a photo or meme' },
  { value: 'short', label: 'Short', icon: Film, description: 'Vertical video (under 60s)' },
  { value: 'video', label: 'Video', icon: Video, description: 'Longer video content' },
] as const;

const suggestedTags = ['meme', 'fails', 'pets', 'gaming', 'comedy', 'sports', 'music', 'food'];

export default function UploadPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const createPost = useCreatePost();

  const [type, setType] = useState<'post' | 'short' | 'video'>('post');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showCamera, setShowCamera] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Validate file type
    const isImage = selectedFile.type.startsWith('image/');
    const isVideo = selectedFile.type.startsWith('video/');

    if (type === 'post' && !isImage) {
      toast.error('Please select an image file for photo posts');
      return;
    }

    if ((type === 'short' || type === 'video') && !isVideo) {
      toast.error('Please select a video file for shorts/videos');
      return;
    }

    // Validate file size (50MB max)
    if (selectedFile.size > 50 * 1024 * 1024) {
      toast.error('File size must be under 50MB');
      return;
    }

    setFile(selectedFile);

    // Create preview
    const url = URL.createObjectURL(selectedFile);
    setPreview(url);
  };

  const handleAddTag = (tag: string) => {
    const cleanTag = tag.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (cleanTag && !tags.includes(cleanTag) && tags.length < 5) {
      setTags([...tags, cleanTag]);
    }
    setTagInput('');
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleTagInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      handleAddTag(tagInput);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!file) {
      toast.error('Please select a file to upload');
      return;
    }

    setUploading(true);

    // Simulate upload progress
    const progressInterval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return prev;
        }
        return prev + 10;
      });
    }, 200);

    try {
      await createPost.mutateAsync({
        type,
        mediaFile: file,
        caption,
        tags,
      });

      clearInterval(progressInterval);
      setUploadProgress(100);
      toast.success('Post created successfully!');
      
      // Navigate to clips page if posting a short/clip, otherwise home
      if (type === 'short') {
        navigate('/clips');
      } else {
        navigate('/home');
      }
    } catch (error: any) {
      clearInterval(progressInterval);
      toast.error(getUserFriendlyError(error));
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const clearFile = () => {
    setFile(null);
    if (preview) {
      URL.revokeObjectURL(preview);
      setPreview(null);
    }
  };

  return (
    <AppLayout>
      {/* Full-screen Camera */}
      {showCamera && (
        <Camera onClose={() => setShowCamera(false)} />
      )}

      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold gradient-text">Create Post</h1>
          <Button
            onClick={() => setShowCamera(true)}
            variant="outline"
            className="gap-2"
          >
            <CameraIcon className="h-4 w-4" />
            Open Camera
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Content Type */}
          <div className="space-y-3">
            <Label>Content Type</Label>
            <div className="grid grid-cols-3 gap-3">
              {contentTypes.map((contentType) => {
                const Icon = contentType.icon;
                return (
                  <motion.button
                    key={contentType.value}
                    type="button"
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      setType(contentType.value);
                      clearFile();
                    }}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      type === contentType.value
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:border-muted-foreground'
                    }`}
                  >
                    <Icon className={`h-8 w-8 mx-auto mb-2 ${
                      type === contentType.value ? 'text-primary' : 'text-muted-foreground'
                    }`} />
                    <p className="font-medium text-sm">{contentType.label}</p>
                  </motion.button>
                );
              })}
            </div>
          </div>

          {/* File Upload */}
          <div className="space-y-3">
            <Label>Upload {type === 'post' ? 'Image' : 'Video'}</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept={type === 'post' ? 'image/*' : 'video/*'}
              onChange={handleFileSelect}
              className="hidden"
            />

            {!file ? (
              <motion.div
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border rounded-xl p-12 cursor-pointer hover:border-primary/50 transition-colors flex flex-col items-center justify-center"
              >
                <Upload className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium">Click to upload</p>
                <p className="text-sm text-muted-foreground">
                  {type === 'post' ? 'JPG, PNG, GIF up to 50MB' : 'MP4, WebM up to 50MB'}
                </p>
              </motion.div>
            ) : (
              <div className="relative rounded-xl overflow-hidden bg-muted">
                {type === 'post' ? (
                  <img src={preview!} alt="Preview" className="w-full max-h-96 object-contain" />
                ) : (
                  <video src={preview!} controls className="w-full max-h-96" />
                )}
                <button
                  type="button"
                  onClick={clearFile}
                  className="absolute top-2 right-2 p-2 rounded-full bg-background/80 hover:bg-background transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {/* Caption */}
          <div className="space-y-3">
            <Label htmlFor="caption">Caption</Label>
            <AICaptionGenerator
              tags={tags}
              contentType={type}
              onSelectCaption={(caption) => setCaption(caption)}
            />
            <Textarea
              id="caption"
              placeholder="Write a caption..."
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="bg-secondary border-border min-h-[100px] resize-none"
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground text-right">{caption.length}/500</p>
          </div>

          {/* Tags */}
          <div className="space-y-3">
            <Label>Tags</Label>
            <div className="flex flex-wrap gap-2 mb-3">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1 pr-1">
                  #{tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="ml-1 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="relative">
              <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Add a tag..."
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagInputKeyDown}
                className="pl-9 bg-secondary border-border"
                disabled={tags.length >= 5}
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {suggestedTags
                .filter((t) => !tags.includes(t))
                .slice(0, 5)
                .map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => handleAddTag(tag)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    #{tag}
                  </button>
                ))}
            </div>
          </div>

          {/* Upload Progress */}
          {uploading && (
            <div className="space-y-2">
              <Progress value={uploadProgress} className="h-2" />
              <p className="text-sm text-muted-foreground text-center">
                Uploading... {uploadProgress}%
              </p>
            </div>
          )}

          {/* Submit */}
          <Button
            type="submit"
            variant="gradient"
            size="xl"
            className="w-full"
            disabled={!file || uploading}
          >
            {uploading ? 'Uploading...' : 'Share Post'}
          </Button>
        </form>
      </div>
    </AppLayout>
  );
}
