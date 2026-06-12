import { useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, X, Camera as CameraIcon, Image as ImageIcon, Star, Send, Loader2, AlertCircle, RotateCcw, BarChart3, ImagePlus } from 'lucide-react';
import { StoryPollEditor, PollData } from './StoryPollEditor';
import { useCreateStory } from '@/hooks/useStories';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { validateStoryMedia, compressImage, generateStoryFileName, generateStoryThumbnail, generateStoryThumbnailFileName } from '@/lib/storyUtils';
import { Camera } from '@/components/camera/Camera';
import { FullscreenPortal } from '@/components/layout/FullscreenPortal';

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
  const coverInputRef = useRef<HTMLInputElement>(null);
  const coverVideoRef = useRef<HTMLVideoElement>(null);

  const [mode, setMode] = useState<CreatorMode>('select');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [thumbnailBlob, setThumbnailBlob] = useState<Blob | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [showCoverEditor, setShowCoverEditor] = useState(false);
  const [coverSeekTime, setCoverSeekTime] = useState(0.5);
  const [isGeneratingCover, setIsGeneratingCover] = useState(false);
  const [caption, setCaption] = useState('');
  const [isCloseFriendsOnly, setIsCloseFriendsOnly] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [pollData, setPollData] = useState<PollData | null>(null);
  const [showPollEditor, setShowPollEditor] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mediaInfo, setMediaInfo] = useState<{
    aspectRatio: number;
    duration: number | null;
    isVideo: boolean;
  } | null>(null);

  const resetState = useCallback(() => {
    setSelectedFile(null);
    setPreview(null);
    setThumbnailBlob(null);
    setThumbnailPreview(null);
    setShowCoverEditor(false);
    setCoverSeekTime(0.5);
    setCaption('');
    setIsCloseFriendsOnly(false);
    setUploadState('idle');
    setUploadProgress(0);
    setErrorMessage(null);
    setMediaInfo(null);
    setMode('select');
  }, []);

  const applyAutoThumbnail = useCallback(async (file: File, isVideo: boolean) => {
    setIsGeneratingCover(true);
    try {
      const thumb = await generateStoryThumbnail(file, isVideo, 0.5);
      setThumbnailBlob(thumb);
      setThumbnailPreview(URL.createObjectURL(thumb));
    } catch (err) {
      console.warn('Auto thumbnail failed:', err);
    } finally {
      setIsGeneratingCover(false);
    }
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
      void applyAutoThumbnail(file, isVideo);
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

      let thumbnailUrl: string | undefined;
      if (thumbnailBlob) {
        const thumbFileName = generateStoryThumbnailFileName(user.id);
        const { error: thumbUploadError } = await supabase.storage
          .from('stories')
          .upload(thumbFileName, thumbnailBlob, {
            cacheControl: '3600',
            upsert: false,
            contentType: 'image/jpeg',
          });

        if (thumbUploadError) {
          console.warn('Thumbnail upload failed:', thumbUploadError);
        } else {
          const { data: { publicUrl: thumbPublicUrl } } = supabase.storage
            .from('stories')
            .getPublicUrl(thumbFileName);
          thumbnailUrl = thumbPublicUrl || undefined;
        }
      }

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
      await (createStory as any).mutateAsync({
        mediaUrl: publicUrl,
        mediaType: mediaInfo.isVideo ? 'video' : 'image',
        thumbnailUrl,
        caption: caption.trim() || undefined,
        isCloseFriendsOnly,
        aspectRatio: mediaInfo.aspectRatio,
        duration: mediaInfo.duration,
        pollData: pollData || undefined,
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

  const handleCoverImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    e.target.value = '';
    try {
      const thumb = await compressImage(file, 360, 0.82);
      setThumbnailBlob(thumb);
      setThumbnailPreview(URL.createObjectURL(thumb));
      setShowCoverEditor(false);
    } catch (err) {
      console.error('Cover image failed:', err);
      toast.error('Could not set cover image');
    }
  };

  const handleApplyVideoFrame = async () => {
    if (!selectedFile || !mediaInfo?.isVideo) return;
    setIsGeneratingCover(true);
    try {
      const thumb = await generateStoryThumbnail(selectedFile, true, coverSeekTime);
      setThumbnailBlob(thumb);
      setThumbnailPreview(URL.createObjectURL(thumb));
      setShowCoverEditor(false);
    } catch (err) {
      console.error('Video frame capture failed:', err);
      toast.error('Could not capture frame');
    } finally {
      setIsGeneratingCover(false);
    }
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
    return (
      <Camera 
        onClose={() => setMode('select')} 
        showBackArrow 
        onCapture={(media) => {
          const isVideo = media.type === 'video';
          setSelectedFile(media.file);
          setPreview(media.url);
          setMediaInfo({
            aspectRatio: 0.5625,
            duration: null,
            isVideo,
          });
          setUploadState('idle');
          setMode('select');
          void applyAutoThumbnail(media.file, isVideo);
        }}
      />
    );
  }

  return (
    <FullscreenPortal>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[6000] bg-black flex flex-col overflow-hidden"
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
          <ArrowLeft className="h-6 w-6" />
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

            {/* Action buttons - only when not processing */}
            {!isProcessing && uploadState !== 'error' && !showPollEditor && !showCoverEditor && (
              <div className="absolute top-3 right-3 flex flex-wrap justify-end gap-2 max-w-[70%]">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowCoverEditor(true)}
                  className="gap-1"
                >
                  {thumbnailPreview ? (
                    <img src={thumbnailPreview} alt="" className="h-4 w-3 rounded-sm object-cover" />
                  ) : (
                    <ImagePlus className="h-3.5 w-3.5" />
                  )}
                  Cover
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowPollEditor(true)}
                  className="gap-1"
                >
                  <BarChart3 className="h-3.5 w-3.5" />
                  Poll
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Change
                </Button>
              </div>
            )}
            <AnimatePresence>
              {showCoverEditor && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-20 flex flex-col items-center justify-end bg-black/70 p-4 gap-3"
                >
                  <div className="w-full max-w-xs rounded-2xl bg-black/80 border border-white/10 p-4 space-y-3">
                    <p className="text-sm font-semibold text-white text-center">Story cover</p>
                    {thumbnailPreview && (
                      <img
                        src={thumbnailPreview}
                        alt="Cover preview"
                        className="mx-auto h-24 w-[68px] rounded-xl object-cover border border-white/15"
                      />
                    )}
                    {mediaInfo?.isVideo && preview && (
                      <div className="space-y-2">
                        <video
                          ref={coverVideoRef}
                          src={preview}
                          className="hidden"
                          muted
                          playsInline
                          preload="metadata"
                        />
                        <input
                          type="range"
                          min={0}
                          max={Math.max((mediaInfo.duration || 10) - 0.1, 0)}
                          step={0.1}
                          value={coverSeekTime}
                          onChange={(e) => setCoverSeekTime(Number(e.target.value))}
                          className="w-full accent-primary"
                        />
                        <Button
                          size="sm"
                          variant="secondary"
                          className="w-full"
                          disabled={isGeneratingCover}
                          onClick={handleApplyVideoFrame}
                        >
                          {isGeneratingCover ? 'Capturing...' : 'Use this frame'}
                        </Button>
                      </div>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full border-white/20 text-white hover:bg-white/10"
                      onClick={() => coverInputRef.current?.click()}
                    >
                      Upload cover image
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="w-full text-white/70"
                      onClick={() => setShowCoverEditor(false)}
                    >
                      Done
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Re-take button — only when idle (no upload in flight) */}
            {uploadState === 'idle' && !isProcessing && (
              <button
                type="button"
                onClick={resetState}
                className="absolute top-3 left-3 z-10 flex items-center gap-1.5 rounded-full bg-black/55 backdrop-blur-md border border-white/15 px-3 py-1.5 text-xs font-semibold text-white active:scale-95 transition-transform"
                aria-label="Re-take"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Re-take
              </button>
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
            {!isProcessing && uploadState !== 'error' && !showPollEditor && (
              <div className="absolute bottom-4 inset-x-4 space-y-2">
                {/* Poll badge if set */}
                {pollData && (
                  <div className="flex items-center gap-2 bg-primary/20 backdrop-blur-sm rounded-full px-3 py-1.5 w-fit">
                    <BarChart3 className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs text-primary font-medium">{pollData.type === 'poll' ? 'Poll' : 'Question'} added</span>
                    <button onClick={() => setPollData(null)} className="ml-1">
                      <X className="h-3 w-3 text-primary/60" />
                    </button>
                  </div>
                )}
                <Input
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Add a caption..."
                  maxLength={150}
                  className="bg-black/50 border-white/20 text-white placeholder:text-white/50"
                />
              </div>
            )}

            {/* Poll Editor overlay */}
            <AnimatePresence>
              {showPollEditor && (
                <div className="absolute inset-0 flex items-center justify-center p-4 bg-black/40">
                  <StoryPollEditor
                    initial={pollData}
                    onSave={(data) => { setPollData(data); setShowPollEditor(false); }}
                    onCancel={() => setShowPollEditor(false)}
                  />
                </div>
              )}
            </AnimatePresence>
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
      <input
        ref={coverInputRef}
        type="file"
        accept="image/*"
        onChange={handleCoverImageSelect}
        className="hidden"
      />
      </motion.div>
    </FullscreenPortal>
  );
}
