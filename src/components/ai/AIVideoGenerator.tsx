import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Video, Loader2, Check, AlertCircle, X, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AIVideoGeneratorProps {
  onVideoGenerated: (videoUrl: string, videoBlob: Blob) => void;
  onClose: () => void;
}

type GenerationStatus = 'idle' | 'generating' | 'polling' | 'succeeded' | 'failed';

export function AIVideoGenerator({ onVideoGenerated, onClose }: AIVideoGeneratorProps) {
  const [prompt, setPrompt] = useState('');
  const [status, setStatus] = useState<GenerationStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const examplePrompts = [
    "A serene sunset over calm ocean waves",
    "A cat walking through a magical forest",
    "Abstract colorful liquid flowing in slow motion",
    "City streets at night with neon lights",
  ];

  const startGeneration = async () => {
    if (!prompt.trim()) {
      toast.error('Please enter a prompt');
      return;
    }

    setStatus('generating');
    setProgress(5);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('generate-runway-video', {
        body: { 
          prompt: prompt.trim(),
          duration: 5,
          aspectRatio: "9:16" // Vertical for social media
        }
      });

      if (fnError) throw fnError;
      
      if (data.error) {
        throw new Error(data.error);
      }

      setTaskId(data.taskId);
      setStatus('polling');
      setProgress(10);
      toast.success('Video generation started! This may take 1-3 minutes.');

    } catch (err) {
      console.error('Generation error:', err);
      setError(err instanceof Error ? err.message : 'Failed to start generation');
      setStatus('failed');
      toast.error(err instanceof Error ? err.message : 'Failed to start video generation');
    }
  };

  const checkStatus = useCallback(async () => {
    if (!taskId) return;

    try {
      const { data, error: fnError } = await supabase.functions.invoke('check-runway-status', {
        body: { taskId }
      });

      if (fnError) throw fnError;

      if (data.error && data.status === 'FAILED') {
        setError(data.error);
        setStatus('failed');
        toast.error('Video generation failed: ' + data.error);
        return;
      }

      setProgress(data.progress || progress);

      if (data.status === 'SUCCEEDED' && data.videoUrl) {
        setStatus('succeeded');
        setProgress(100);
        
        // Fetch the video and convert to blob
        try {
          const response = await fetch(data.videoUrl);
          const blob = await response.blob();
          onVideoGenerated(data.videoUrl, blob);
          toast.success('AI video generated successfully!');
        } catch (fetchErr) {
          console.error('Error fetching video:', fetchErr);
          // Still provide the URL even if blob conversion fails
          onVideoGenerated(data.videoUrl, new Blob());
          toast.success('AI video generated!');
        }
      } else if (data.status === 'FAILED' || data.status === 'CANCELLED') {
        setError(data.error || 'Generation failed');
        setStatus('failed');
      }

    } catch (err) {
      console.error('Status check error:', err);
    }
  }, [taskId, progress, onVideoGenerated]);

  // Poll for status updates
  useEffect(() => {
    if (status !== 'polling' || !taskId) return;

    const interval = setInterval(checkStatus, 5000);
    // Initial check
    checkStatus();

    return () => clearInterval(interval);
  }, [status, taskId, checkStatus]);

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
        className="w-full max-w-md liquid-glass rounded-3xl p-6 space-y-6"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-animated flex items-center justify-center">
              <Wand2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold">AI Video Generator</h2>
              <p className="text-xs text-muted-foreground">Powered by Runway ML</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-muted transition-colors"
            disabled={status === 'generating' || status === 'polling'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <AnimatePresence mode="wait">
          {status === 'idle' && (
            <motion.div
              key="input"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <label className="text-sm font-medium">Describe your video</label>
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="A cinematic scene of..."
                  className="min-h-24 resize-none"
                  maxLength={500}
                />
                <p className="text-xs text-muted-foreground text-right">{prompt.length}/500</p>
              </div>

              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Try these:</p>
                <div className="flex flex-wrap gap-2">
                  {examplePrompts.map((example, i) => (
                    <button
                      key={i}
                      onClick={() => setPrompt(example)}
                      className="text-xs px-3 py-1.5 rounded-full bg-muted hover:bg-muted/80 transition-colors text-left"
                    >
                      {example.slice(0, 30)}...
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
                <Sparkles className="w-4 h-4 mr-2" />
                Generate Video
              </Button>

              <p className="text-xs text-center text-muted-foreground">
                Generation takes 1-3 minutes. Uses your Runway credits.
              </p>
            </motion.div>
          )}

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
                    <Video className="w-8 h-8 text-white" />
                  </div>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    className="absolute -inset-2 border-2 border-primary/30 border-t-primary rounded-full"
                  />
                </div>
                <div className="text-center">
                  <p className="font-medium">Creating your video...</p>
                  <p className="text-sm text-muted-foreground">This may take 1-3 minutes</p>
                </div>
              </div>

              <div className="space-y-2">
                <Progress value={progress} className="h-2" />
                <p className="text-xs text-center text-muted-foreground">{progress}% complete</p>
              </div>

              <p className="text-xs text-center text-muted-foreground px-4">
                "{prompt.slice(0, 60)}{prompt.length > 60 ? '...' : ''}"
              </p>
            </motion.div>
          )}

          {status === 'succeeded' && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="py-8 flex flex-col items-center gap-4"
            >
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
                <Check className="w-8 h-8 text-green-500" />
              </div>
              <div className="text-center">
                <p className="font-medium">Video Generated!</p>
                <p className="text-sm text-muted-foreground">Your AI video is ready to use</p>
              </div>
            </motion.div>
          )}

          {status === 'failed' && (
            <motion.div
              key="error"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="py-8 space-y-4"
            >
              <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-destructive/20 flex items-center justify-center">
                  <AlertCircle className="w-8 h-8 text-destructive" />
                </div>
                <div className="text-center">
                  <p className="font-medium">Generation Failed</p>
                  <p className="text-sm text-muted-foreground">{error || 'Something went wrong'}</p>
                </div>
              </div>
              <Button
                onClick={() => {
                  setStatus('idle');
                  setError(null);
                  setTaskId(null);
                  setProgress(0);
                }}
                variant="outline"
                className="w-full"
              >
                Try Again
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
