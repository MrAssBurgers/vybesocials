import { useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Camera as CameraIcon, Image as ImageIcon, Star, Send, Loader2, AlertCircle, RotateCcw } from 'lucide-react';
import { useCreateStory } from '@/hooks/useStories';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { validateStoryMedia, compressImage, generateStoryFileName } from '@/lib/storyUtils';
import { Camera } from '@/components/camera/Camera';

interface StoryCreatorProps {
  onClose: () => void;
}

type UploadState = 'idle' | 'validating' | 'compressing' | 'uploading' | 'saving' | 'error';
type CreatorMode = 'select' | 'camera' | 'gallery';

export function StoryCreator({ onClose }: StoryCreatorProps) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const createStory = useCreateStory();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<CreatorMode>('select');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [isCloseFriendsOnly, setIsCloseFriendsOnly] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mediaInfo, setMediaInfo] = useState<{
    aspectRatio: number;
    duration: number | null;
    isVideo: boolean;
  } | null>(null);

  const resetState = useCallback(() => {
    setSelectedFile(null);
    setPreview(null);
    setCaption('');
    setIsCloseFriendsOnly(false);
    setUploadState('idle');
    setUploadProgress(0);
    setErrorMessage(null);
    setMediaInfo(null);
    setMode('select');
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadState('validating');
    setErrorMessage(null);

    try {
      const validation = await validateStoryMedia(file);
      
      if (!validation.valid) {
        setErrorMessage(validation.error || 'Invalid media file');
        setUploadState('error');
        return;
      }

      const isVideo = file.type.startsWith('video/');
      setMediaInfo({
        aspectRatio: validation.aspectRatio || 0.5625,
        duration: validation.duration || null,
        isVideo,
      });

      setSelectedFile(file);
      setPreview(URL.createObjectURL(file));
      setUploadState('idle');
    } catch (err) {
      console.error('File validation error:', err);
      setErrorMessage('Failed to process media file');
      setUploadState('error');
    }
    
    // Reset file input for re-selection
    e.target.value = '';
  };

  const handleSubmit = async () => {
    if (!selectedFile || !profile?.id || !mediaInfo) return;

    setUploadState('compressing');
    setUploadProgress(10);
    setErrorMessage(null);

    try {
      let fileToUpload: File | Blob = selectedFile;

      // Compress images (skip for videos)
      if (!mediaInfo.isVideo) {
        try {
          const compressed = await compressImage(selectedFile);
          fileToUpload = compressed;
          setUploadProgress(30);
        } catch (compressErr) {
          console.warn('Image compression failed, using original:', compressErr);
        }
      }

      setUploadState('uploading');
      setUploadProgress(40);

      // Generate unique filename - use auth.uid() format (user_id, not profile.id)
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      
      const fileName = generateStoryFileName(user.id, mediaInfo.isVideo ? 'video' : 'image');

      // Upload to stories bucket
      const { error: uploadError } = await supabase.storage
        .from('stories')
        .upload(fileName, fileToUpload, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      setUploadProgress(70);

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('stories')
        .getPublicUrl(fileName);

      if (!publicUrl) {
        throw new Error('Failed to get public URL');
      }

      setUploadState('saving');
      setUploadProgress(85);

      // Create story record
      await createStory.mutateAsync({
        mediaUrl: publicUrl,
        mediaType: mediaInfo.isVideo ? 'video' : 'image',
        caption: caption.trim() || undefined,
        isCloseFriendsOnly,
        aspectRatio: mediaInfo.aspectRatio,
        duration: mediaInfo.duration,
      });

      setUploadProgress(100);
      toast.success('Story posted!');
      
      // Small delay to show completion
      setTimeout(() => {
        onClose();
      }, 300);
    } catch (error) {
      console.error('Failed to create story:', error);
      const message = error instanceof Error ? error.message : 'Failed to create story';
      setErrorMessage(message);
      setUploadState('error');
      toast.error(message);
    }
  };

  const handleRetry = () => {
    setUploadState('idle');
    setErrorMessage(null);
    setUploadProgress(0);
  };

  const isProcessing = uploadState !== 'idle' && uploadState !== 'error';

  const getStatusText = () => {
    switch (uploadState) {
      case 'validating': return 'Validating...';
      case 'compressing': return 'Optimizing...';
      case 'uploading': return 'Uploading...';
      case 'saving': return 'Saving...';
      default: return '';
    }
  };

  // Show camera view when camera mode is selected
  if (mode === 'camera') {
    return <Camera onClose={onClose} />;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 flex-shrink-0">
        <Button 
          variant="ghost"
          size="icon" 
          onClick={onClose} 
          className="text-white"
          disabled={isProcessing}
        >
          <X className="h-6 w-6" />
        </Button>
        <h2 className="text-white font-semibold">{t('stories.createStory')}</h2>
        <div className="w-10" />
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-4 min-h-0 overflow-auto">
        {preview ? (
          <div className="relative w-full max-w-sm max-h-[60vh] aspect-[9/16] rounded-2xl overflow-hidden bg-black/50 flex-shrink-0">
            {mediaInfo?.isVideo ? (
              <video
                src={preview}
                className="w-full h-full object-cover"
                autoPlay
                loop
                muted
                playsInline
              />
            ) : (
              <img src={preview} alt="Preview" className="w-full h-full object-cover" />
            )}

            {/* Upload overlay */}
            <AnimatePresence>
              {isProcessing && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-4"
                >
                  <Loader2 className="h-10 w-10 text-white animate-spin" />
                  <p className="text-white font-medium">{getStatusText()}</p>
                  <div className="w-48">
                    <Progress value={uploadProgress} className="h-2" />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Error overlay */}
            <AnimatePresence>
              {uploadState === 'error' && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-4 p-6"
                >
                  <AlertCircle className="h-12 w-12 text-red-500" />
                  <p className="text-white font-medium text-center">{errorMessage}</p>
                  <Button onClick={handleRetry} variant="secondary" className="gap-2">
                    <RotateCcw className="h-4 w-4" />
                    Try Again
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Caption input overlay - only when not processing */}
            {!isProcessing && uploadState !== 'error' && (
              <div className="absolute bottom-4 inset-x-4">
                <Input
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder={t('stories.addCaption')}
                  maxLength={150}
                  className="bg-black/50 border-white/20 text-white placeholder:text-white/50"
                />
              </div>
            )}

            {/* Change button - only when not processing */}
            {!isProcessing && uploadState !== 'error' && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="absolute top-4 right-4"
              >
                Change
              </Button>
            )}
          </div>
        ) : uploadState === 'error' ? (
          <div className="flex flex-col items-center gap-4 p-8">
            <AlertCircle className="h-12 w-12 text-red-500" />
            <p className="text-white/70 text-center">{errorMessage}</p>
            <Button onClick={handleRetry} variant="secondary" className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Try Again
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-6 p-8">
            <p className="text-white/70 text-lg font-medium">{t('stories.selectMedia')}</p>
            
            <div className="flex gap-6">
              {/* Camera option - opens full camera with filters */}
              <button
                onClick={() => setMode('camera')}
                className="flex flex-col items-center gap-3 p-6 border-2 border-dashed border-white/30 rounded-2xl hover:border-primary/50 hover:bg-white/5 transition-all group"
              >
                <div className="p-5 bg-gradient-to-br from-primary/20 to-primary/5 rounded-full group-hover:from-primary/30 group-hover:to-primary/10 transition-colors">
                  <CameraIcon className="h-10 w-10 text-primary" />
                </div>
                <span className="text-white font-medium">Camera</span>
                <span className="text-white/40 text-xs">With filters</span>
              </button>
              
              {/* Gallery option - opens file picker */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center gap-3 p-6 border-2 border-dashed border-white/30 rounded-2xl hover:border-primary/50 hover:bg-white/5 transition-all group"
              >
                <div className="p-5 bg-gradient-to-br from-primary/20 to-primary/5 rounded-full group-hover:from-primary/30 group-hover:to-primary/10 transition-colors">
                  <ImageIcon className="h-10 w-10 text-primary" />
                </div>
                <span className="text-white font-medium">Gallery</span>
                <span className="text-white/40 text-xs">Choose photo/video</span>
              </button>
            </div>
            
            <p className="text-white/40 text-sm mt-2">Images or videos up to 60s</p>
          </div>
        )}
      </div>

      {/* Footer */}
      {preview && uploadState !== 'error' && (
        <div className="p-4 space-y-4">
          {/* Close friends toggle */}
          <div className="flex items-center justify-between bg-white/10 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <Star className="h-5 w-5 text-green-400" />
              <Label htmlFor="close-friends" className="text-white font-medium">
                {t('stories.closeFriendsOnly')}
              </Label>
            </div>
            <Switch
              id="close-friends"
              checked={isCloseFriendsOnly}
              onCheckedChange={setIsCloseFriendsOnly}
              disabled={isProcessing}
            />
          </div>

          {/* Submit button */}
          <Button
            onClick={handleSubmit}
            disabled={isProcessing}
            className="w-full gradient-animated text-white font-semibold h-12"
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                {getStatusText()}
              </>
            ) : (
              <>
                <Send className="h-5 w-5 mr-2" />
                {t('stories.share')}
              </>
            )}
          </Button>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        onChange={handleFileSelect}
        className="hidden"
        capture="environment"
      />
    </motion.div>
  );
}
