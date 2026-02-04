import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, X, Wand2, RefreshCw, Type, Upload, Bot, Image, Video } from 'lucide-react';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useCreatePost } from '@/hooks/usePosts';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface AIVideoGeneratorProps {
  onVideoGenerated?: (videoUrl: string, videoBlob: Blob) => void;
  onClose: () => void;
}

type GenerationStatus = 'idle' | 'generating' | 'polling' | 'preview' | 'details' | 'posting';
type ContentMode = 'image' | 'video';

export function AIVideoGenerator({ onVideoGenerated, onClose }: AIVideoGeneratorProps) {
  const navigate = useNavigate();
  const createPost = useCreatePost();
  
  const [prompt, setPrompt] = useState('');
  const [status, setStatus] = useState<GenerationStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState<string[]>(['ai']);
  const [mode, setMode] = useState<ContentMode>('image');
  const [pollProgress, setPollProgress] = useState(0);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const examplePrompts = [
    "A serene sunset over calm ocean waves",
    "A cat walking through a magical forest",
    "Abstract colorful liquid flowing in slow motion",
    "City streets at night with neon lights",
    "Northern lights dancing over snowy mountains",
    "A cozy coffee shop on a rainy day",
  ];

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  const pollVideoStatus = async (taskId: string) => {
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes max (5s intervals)
    
    pollIntervalRef.current = setInterval(async () => {
      attempts++;
      setPollProgress(Math.min((attempts / maxAttempts) * 100, 95));
      
      if (attempts >= maxAttempts) {
        clearInterval(pollIntervalRef.current!);
        setError('Video generation timed out. Please try again.');
        setStatus('idle');
        toast.error('Video generation timed out');
        return;
      }

      try {
        const { data, error: fnError } = await supabase.functions.invoke('check-runway-status', {
          body: { taskId }
        });

        if (fnError) throw fnError;

        if (data.status === 'SUCCEEDED' && data.videoUrl) {
          clearInterval(pollIntervalRef.current!);
          setGeneratedUrl(data.videoUrl);
          setStatus('preview');
          setPollProgress(100);
          toast.success('Video generated successfully!');
        } else if (data.status === 'FAILED') {
          clearInterval(pollIntervalRef.current!);
          setError('Video generation failed. Please try again.');
          setStatus('idle');
          toast.error('Video generation failed');
        }
        // Otherwise keep polling (PENDING/RUNNING)
      } catch (err) {
        console.error('Poll error:', err);
        // Don't stop polling on transient errors
      }
    }, 5000); // Poll every 5 seconds
  };

  const startGeneration = async () => {
    if (!prompt.trim()) {
      toast.error('Please enter a prompt');
      return;
    }

    setStatus('generating');
    setError(null);
    setPollProgress(0);

    try {
      if (mode === 'image') {
        // Generate image using Lovable AI
        const { data, error: fnError } = await supabase.functions.invoke('generate-ai-video', {
          body: { prompt: prompt.trim() }
        });

        if (fnError) throw fnError;
        
        if (data.error) {
          throw new Error(data.error);
        }

        if (data.imageUrl) {
          setGeneratedUrl(data.imageUrl);
          setStatus('preview');
          toast.success('AI image generated!');
        } else {
          throw new Error('No image returned');
        }
      } else {
        // Generate video using Runway
        const { data, error: fnError } = await supabase.functions.invoke('generate-runway-video', {
          body: { 
            prompt: prompt.trim(),
            duration: 5,
            aspectRatio: '9:16' // Vertical for social
          }
        });

        if (fnError) throw fnError;
        
        if (data.error) {
          throw new Error(data.error);
        }

        if (data.taskId) {
          setStatus('polling');
          toast.info('Video generation started! This may take 1-3 minutes...');
          pollVideoStatus(data.taskId);
        } else {
          throw new Error('No task ID returned');
        }
      }

    } catch (err) {
      console.error('Generation error:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate');
      setStatus('idle');
      toast.error(err instanceof Error ? err.message : 'Failed to generate AI content');
    }
  };

  const handleRemake = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }
    setGeneratedUrl(null);
    setStatus('idle');
    setTitle('');
    setPollProgress(0);
  }, []);

  const handleContinueToDetails = useCallback(() => {
    setStatus('details');
  }, []);

  const handlePost = async () => {
    if (!generatedUrl) return;

    setStatus('posting');

    try {
      const response = await fetch(generatedUrl);
      const blob = await response.blob();
      const ext = mode === 'video' ? 'mp4' : 'png';
      const mimeType = mode === 'video' ? 'video/mp4' : 'image/png';
      const file = new File([blob], `ai-${mode}-${Date.now()}.${ext}`, { type: mimeType });

      const caption = title ? `✨ ${title}\n\n🤖 Created with AI` : '🤖 Created with AI';

      await createPost.mutateAsync({
        mediaFile: file,
        caption,
        type: mode === 'video' ? 'short' : 'post',
        tags: tags.includes('ai') ? tags : [...tags, 'ai']
      });

      toast.success('AI content posted successfully!');
      navigate('/home');
      onClose();
    } catch (err) {
      console.error('Post error:', err);
      toast.error('Failed to post. Please try again.');
      setStatus('details');
    }
  };

  const handleUseInUpload = useCallback(async () => {
    if (!generatedUrl || !onVideoGenerated) return;
    
    try {
      const response = await fetch(generatedUrl);
      const blob = await response.blob();
      onVideoGenerated(generatedUrl, blob);
    } catch (err) {
      console.error('Error:', err);
      toast.error('Failed to load generated content');
    }
  }, [generatedUrl, onVideoGenerated]);

  const isVideo = mode === 'video';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        className="w-full max-w-md liquid-glass rounded-3xl p-6 space-y-6 max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-animated flex items-center justify-center">
              <Wand2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold">AI Content Generator</h2>
              <p className="text-xs text-muted-foreground">Powered by Lovable AI</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-muted transition-colors"
            disabled={status === 'generating' || status === 'polling' || status === 'posting'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Toggle - Only show in idle state */}
        {status === 'idle' && (
          <div className="flex gap-2 p-1 bg-muted rounded-xl">
            <button
              onClick={() => setMode('image')}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all",
                mode === 'image' 
                  ? "bg-background shadow-sm text-foreground" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Image className="w-4 h-4" />
              Image
            </button>
            <button
              onClick={() => setMode('video')}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all",
                mode === 'video' 
                  ? "bg-background shadow-sm text-foreground" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Video className="w-4 h-4" />
              Video
            </button>
          </div>
        )}

        <AnimatePresence mode="wait">
          {/* Idle - Input prompt */}
          {status === 'idle' && (
            <motion.div
              key="input"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Describe your {mode}
                </label>
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={isVideo ? "A cinematic scene of..." : "A beautiful image of..."}
                  className="min-h-24 resize-none"
                  maxLength={500}
                />
                <p className="text-xs text-muted-foreground text-right">{prompt.length}/500</p>
              </div>

              {isVideo && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    ⚡ Video generation takes 1-3 minutes and requires Runway API credits
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Try these:</p>
                <div className="flex flex-wrap gap-2">
                  {examplePrompts.map((example, i) => (
                    <button
                      key={i}
                      onClick={() => setPrompt(example)}
                      className="text-xs px-3 py-1.5 rounded-full bg-muted hover:bg-muted/80 transition-colors text-left"
                    >
                      {example.slice(0, 25)}...
                    </button>
                  ))}
                </div>
              </div>

              <Button
                onClick={startGeneration}
                disabled={!prompt.trim()}
                className="w-full"
                size="lg"
              >
                <VybeMiniIcon size={16} showSparkles className="mr-2" />
                Generate {mode === 'video' ? 'Video' : 'Image'}
              </Button>
            </motion.div>
          )}

          {/* Generating */}
          {(status === 'generating' || status === 'polling') && (
            <motion.div
              key="loading"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6 py-8"
            >
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <div className="w-16 h-16 rounded-2xl gradient-animated flex items-center justify-center">
                    {isVideo ? <Video className="w-8 h-8 text-white" /> : <Wand2 className="w-8 h-8 text-white" />}
                  </div>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    className="absolute -inset-2 border-2 border-primary/30 border-t-primary rounded-full"
                  />
                </div>
                <div className="text-center">
                  <p className="font-medium">
                    {status === 'polling' ? 'Rendering your video...' : 'Creating your content...'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {status === 'polling' ? 'This may take 1-3 minutes' : 'This may take a moment'}
                  </p>
                </div>
              </div>

              {status === 'polling' && (
                <div className="space-y-2">
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-gradient-to-r from-violet-500 to-purple-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${pollProgress}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                  <p className="text-xs text-center text-muted-foreground">
                    {Math.round(pollProgress)}% complete
                  </p>
                </div>
              )}

              <p className="text-xs text-center text-muted-foreground px-4">
                "{prompt.slice(0, 60)}{prompt.length > 60 ? '...' : ''}"
              </p>

              {status === 'polling' && (
                <Button
                  onClick={handleRemake}
                  variant="ghost"
                  size="sm"
                  className="w-full text-muted-foreground"
                >
                  Cancel
                </Button>
              )}
            </motion.div>
          )}

          {/* Preview - Show generated content with remake option */}
          {status === 'preview' && generatedUrl && (
            <motion.div
              key="preview"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <div className="relative rounded-2xl overflow-hidden bg-muted aspect-[9/16] max-h-[50vh]">
                {isVideo ? (
                  <video 
                    src={generatedUrl} 
                    className="w-full h-full object-cover"
                    controls
                    autoPlay
                    loop
                    muted
                    playsInline
                  />
                ) : (
                  <img 
                    src={generatedUrl} 
                    alt="AI Generated" 
                    className="w-full h-full object-cover"
                  />
                )}
                <Badge className="absolute top-3 left-3 bg-gradient-to-r from-violet-500 to-purple-500 text-white border-0">
                  <Bot className="w-3 h-3 mr-1" />
                  AI {isVideo ? 'Video' : 'Image'}
                </Badge>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleRemake}
                  variant="outline"
                  className="flex-1"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Remake
                </Button>
                <Button
                  onClick={handleContinueToDetails}
                  className="flex-1"
                >
                  <Type className="w-4 h-4 mr-2" />
                  Add Details
                </Button>
              </div>

              {onVideoGenerated && (
                <Button
                  onClick={handleUseInUpload}
                  variant="ghost"
                  className="w-full text-muted-foreground"
                >
                  Use in upload page instead
                </Button>
              )}
            </motion.div>
          )}

          {/* Details - Add title and post */}
          {status === 'details' && generatedUrl && (
            <motion.div
              key="details"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <div className="relative rounded-2xl overflow-hidden bg-muted aspect-video">
                {isVideo ? (
                  <video 
                    src={generatedUrl} 
                    className="w-full h-full object-cover"
                    autoPlay
                    loop
                    muted
                    playsInline
                  />
                ) : (
                  <img 
                    src={generatedUrl} 
                    alt="AI Generated" 
                    className="w-full h-full object-cover"
                  />
                )}
                <Badge className="absolute top-3 left-3 bg-gradient-to-r from-violet-500 to-purple-500 text-white border-0">
                  <Bot className="w-3 h-3 mr-1" />
                  AI {isVideo ? 'Video' : 'Image'}
                </Badge>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Title (optional)</label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Give your creation a title..."
                  maxLength={100}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Tags</label>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="gap-1">
                      #{tag}
                      {tag !== 'ai' && (
                        <button 
                          onClick={() => setTags(tags.filter(t => t !== tag))}
                          className="ml-1 hover:text-destructive"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Bot className="w-3 h-3" />
                  This post will be marked as AI-generated
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  onClick={() => setStatus('preview')}
                  variant="outline"
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  onClick={handlePost}
                  className="flex-1 bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Post
                </Button>
              </div>
            </motion.div>
          )}

          {/* Posting */}
          {status === 'posting' && (
            <motion.div
              key="posting"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="py-12 flex flex-col items-center gap-4"
            >
              <Loader2 className="w-12 h-12 text-primary animate-spin" />
              <p className="font-medium">Posting your AI creation...</p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
