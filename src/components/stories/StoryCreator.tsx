import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, X, Camera as CameraIcon, Image as ImageIcon, Star, Send, Loader2, AlertCircle, RotateCcw, BarChart3, ImagePlus } from 'lucide-react';
import { StoryPollEditor, PollData } from './StoryPollEditor';
import { useCreateStory } from '@/hooks/useStories';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { useAuth } from '@/lib/auth';
import { withTimeout } from '@/lib/withTimeout';
import { publishStoryMedia } from '@/lib/publishStoryMedia';
import { runPublishVybeCheck } from '@/lib/vybeCheck';
import { resolveStoryAuthorProfileId } from '@/lib/resolveSessionProfileId';
import { refreshFirebaseSession } from '@/lib/firebaseAuthRefresh';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { validateStoryMedia, compressImage, generateStoryThumbnail, inferStoryMediaKind } from '@/lib/storyUtils';
import { Camera } from '@/components/camera/Camera';
import { FullscreenPortal } from '@/components/layout/FullscreenPortal';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';

interface StoryCreatorProps {
  onClose: () => void;
}

const STORY_FILE_ACCEPT =
  'image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,video/mp4,video/quicktime,video/webm,video/3gpp,video/*,image/*';

/** Nested inside labels — best mobile WebView support */
const storyGalleryInputClassName =
  'absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0';

function StoryGalleryInput({
  onChange,
}: {
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <input
      type="file"
      accept={STORY_FILE_ACCEPT}
      onChange={onChange}
      className={storyGalleryInputClassName}
      aria-label="Choose story photo or video"
    />
  );
}

type UploadState = 'idle' | 'validating' | 'compressing' | 'uploading' | 'saving' | 'error';
type CreatorMode = 'select' | 'camera' | 'gallery';

export function StoryCreator({ onClose }: StoryCreatorProps) {
  const { t } = useTranslation();
  const { profile, user, loading: authLoading } = useAuth();
  const profileId = useAuthProfileId();
  const effectiveProfileId = profile?.id ?? profileId;
  const createStory = useCreateStory();
  const queryClient = useQueryClient();
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

  useEffect(() => {  }, [effectiveProfileId, user, profile?.id]);

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

  const processGalleryFile = useCallback(async (file: File) => {
    setUploadState('validating');
    setErrorMessage(null);

    try {
      const validation = await validateStoryMedia(file);

      if (!validation.valid) {
        setErrorMessage(validation.error || 'Invalid media file');
        setUploadState('error');
        toast.error(validation.error || 'Invalid media file');
        return;
      }

      const isVideo = inferStoryMediaKind(file) === 'video';
      if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview);

      setMediaInfo({
        aspectRatio: validation.aspectRatio || 0.5625,
        duration: validation.duration || null,
        isVideo,
      });

      setSelectedFile(file);
      setPreview(URL.createObjectURL(file));
      setUploadState('idle');
      void applyAutoThumbnail(file, isVideo);      toast.success(isVideo ? 'Video selected' : 'Photo selected', { duration: 1500 });
    } catch (err) {
      console.error('File validation error:', err);
      const msg = err instanceof Error ? err.message : 'Failed to process media file';
      setErrorMessage(msg);
      setUploadState('error');
      toast.error(msg);
    }
  }, [applyAutoThumbnail, preview]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    await processGalleryFile(file);
  };

  const handleSubmit = async () => {
    if (!selectedFile || !mediaInfo) {
      toast.error('Media is still loading. Wait a moment and try again.');
      return;
    }

    if (authLoading) {      toast.error('Checking sign-in… try again in a moment.');
      return;
    }

    if (!user) {      toast.error('Sign in to post stories.');
      return;
    }

    setUploadState('validating');
    setUploadProgress(5);
    setErrorMessage(null);

    try {
      const vybe = await runPublishVybeCheck({
        caption: caption.trim(),
        mediaFile: selectedFile,
        contentType: 'story',
      });
      if (vybe.blocked || !vybe.allowed) {
        setUploadState('error');
        setErrorMessage(vybe.message || 'Story did not pass Vybe Check');
        toast.error(vybe.message || 'Story blocked — Vybe Check did not pass');
        return;
      }

      await refreshFirebaseSession(8000);
      const authorProfileId = await resolveStoryAuthorProfileId(effectiveProfileId);
      setUploadState('uploading');

      const { mediaUrl, thumbnailUrl } = await publishStoryMedia({
        file: selectedFile,
        isVideo: mediaInfo.isVideo,
        thumbnailBlob,
        onProgress: (p) => setUploadProgress(Math.max(40, p)),
      });

      setUploadState('saving');
      setUploadProgress(85);

      await withTimeout(
        createStory.mutateAsync({
          mediaUrl,
          mediaType: mediaInfo.isVideo ? 'video' : 'image',
          thumbnailUrl,
          caption: caption.trim() || undefined,
          isCloseFriendsOnly,
          aspectRatio: mediaInfo.aspectRatio,
          duration: mediaInfo.duration,
          pollData: pollData || undefined,
        }),
        60000,
        'Saving story timed out. Please try again.',
      );
      setUploadProgress(100);
      setUploadState('idle');
      toast.success('Story posted!');
      void queryClient.invalidateQueries({ queryKey: ['stories'], refetchType: 'all' });

      setTimeout(() => {
        onClose();
      }, 300);
    } catch (error) {
      console.error('Failed to create story:', error);
      const message = error instanceof Error ? error.message : 'Failed to create story';      setErrorMessage(message);
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
  const canShare = !!selectedFile && !!mediaInfo && !isProcessing;

  function getStatusText() {
    switch (uploadState) {
      case 'validating': return 'Validating...';
      case 'compressing': return 'Optimizing...';
      case 'uploading': return 'Uploading...';
      case 'saving': return 'Saving...';
      default: return '';
    }
  }

  const shareBlockedReason =
    !selectedFile || !mediaInfo
      ? 'Media still loading'
      : isProcessing
        ? getStatusText() || 'Upload in progress'
        : null;

  useEffect(() => {
    if (isProcessing) {
      document.body.setAttribute('data-story-upload-active', 'true');
    } else {
      document.body.removeAttribute('data-story-upload-active');
    }
    return () => document.body.removeAttribute('data-story-upload-active');
  }, [isProcessing]);

  // Show camera view when camera mode is selected
  if (mode === 'camera') {
    return (
      <Camera 
        onClose={() => setMode('select')} 
        showBackArrow 
        onCapture={(media) => {
          const isVideo = media.type === 'video';
          if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview);
          setSelectedFile(media.file);
          setPreview(media.url);
          setMediaInfo({
            aspectRatio: 0.5625,
            duration: null,
            isVideo,
          });
          setUploadState('idle');
          setErrorMessage(null);
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
                <Button variant="secondary" size="sm" asChild>
                  <label className="relative cursor-pointer overflow-hidden inline-flex items-center justify-center px-3 py-2">
                    <StoryGalleryInput onChange={handleFileSelect} />
                    <span className="relative z-0 pointer-events-none">Change</span>
                  </label>
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

            {/* Upload overlay — full preview frame */}
            <AnimatePresence>
              {isProcessing && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-20 bg-black/70 flex flex-col items-center justify-center gap-4 px-6"
                >
                  <Loader2 className="h-10 w-10 text-white animate-spin" />
                  <p className="text-white font-medium text-center">{getStatusText()}</p>
                  <div className="w-full max-w-xs">
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
        ) : uploadState === 'validating' ? (
          <div className="flex flex-col items-center gap-4 p-8">
            <Loader2 className="h-10 w-10 text-white animate-spin" />
            <p className="text-white/70 text-lg font-medium">{getStatusText()}</p>
          </div>
        ) : uploadState === 'error' ? (
          <div className="flex flex-col items-center gap-4 p-8">
            <AlertCircle className="h-12 w-12 text-red-500" />
            <p className="text-white/70 text-center">{errorMessage}</p>
            <Button onClick={handleRetry} variant="secondary" className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Try Again
            </Button>
            <label className="relative inline-flex items-center justify-center gap-2 rounded-md border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white cursor-pointer active:scale-95 overflow-hidden">
              <StoryGalleryInput onChange={handleFileSelect} />
              <ImageIcon className="h-4 w-4 relative z-0 pointer-events-none" />
              <span className="relative z-0 pointer-events-none">Choose from gallery</span>
            </label>
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
              
              {/* Gallery — file input nested inside label (iOS/Despia) */}
              <label className="relative flex flex-col items-center gap-3 p-6 border-2 border-dashed border-white/30 rounded-2xl hover:border-primary/50 hover:bg-white/5 transition-all group cursor-pointer active:scale-[0.98] overflow-hidden">
                <StoryGalleryInput onChange={handleFileSelect} />
                <div className="relative z-0 p-5 bg-gradient-to-br from-primary/20 to-primary/5 rounded-full group-hover:from-primary/30 group-hover:to-primary/10 transition-colors pointer-events-none">
                  <ImageIcon className="h-10 w-10 text-primary" />
                </div>
                <span className="relative z-0 text-white font-medium pointer-events-none">Gallery</span>
                <span className="relative z-0 text-white/40 text-xs pointer-events-none">Choose photo/video</span>
              </label>
            </div>
            
            <p className="text-white/40 text-sm mt-2">Images or videos up to 60s</p>
          </div>
        )}
      </div>

      {/* Footer */}
      {preview && uploadState !== 'error' && (
        <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-4 flex-shrink-0">
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

          {/* Submit button — only disable during active upload, not while profile hydrates */}
          <Button
            type="button"
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
          {shareBlockedReason && !isProcessing && (
            <p className="text-xs text-center text-white/50">{shareBlockedReason}</p>
          )}
        </div>
      )}

      {/* Hidden cover image picker */}
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
