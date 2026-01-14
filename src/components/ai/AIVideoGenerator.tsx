import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Loader2, Check, AlertCircle, X, Wand2, RefreshCw, Type, Upload, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useCreatePost } from '@/hooks/usePosts';
import { useNavigate } from 'react-router-dom';

interface AIVideoGeneratorProps {
  onVideoGenerated?: (videoUrl: string, videoBlob: Blob) => void;
  onClose: () => void;
}

type GenerationStatus = 'idle' | 'generating' | 'preview' | 'details' | 'posting';

export function AIVideoGenerator({ onVideoGenerated, onClose }: AIVideoGeneratorProps) {
  const navigate = useNavigate();
  const createPost = useCreatePost();
  
  const [prompt, setPrompt] = useState('');
  const [status, setStatus] = useState<GenerationStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState<string[]>(['ai']);

  const examplePrompts = [
    "A serene sunset over calm ocean waves",
    "A cat walking through a magical forest",
    "Abstract colorful liquid flowing in slow motion",
    "City streets at night with neon lights",
    "Northern lights dancing over snowy mountains",
    "A cozy coffee shop on a rainy day",
  ];

  const startGeneration = async () => {
    if (!prompt.trim()) {
      toast.error('Please enter a prompt');
      return;
    }

    setStatus('generating');
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('generate-ai-video', {
        body: { prompt: prompt.trim() }
      });

      if (fnError) throw fnError;
      
      if (data.error) {
        throw new Error(data.error);
      }

      if (data.imageUrl) {
        setGeneratedImageUrl(data.imageUrl);
        setStatus('preview');
        toast.success('AI content generated!');
      } else {
        throw new Error('No image returned');
      }

    } catch (err) {
      console.error('Generation error:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate');
      setStatus('idle');
      toast.error(err instanceof Error ? err.message : 'Failed to generate AI content');
    }
  };

  const handleRemake = useCallback(() => {
    setGeneratedImageUrl(null);
    setStatus('idle');
    setTitle('');
  }, []);

  const handleContinueToDetails = useCallback(() => {
    setStatus('details');
  }, []);

  const handlePost = async () => {
    if (!generatedImageUrl) return;

    setStatus('posting');

    try {
      // Fetch the image and create a File
      const response = await fetch(generatedImageUrl);
      const blob = await response.blob();
      const file = new File([blob], `ai-content-${Date.now()}.png`, { type: 'image/png' });

      // Combine title and any additional text as caption
      const caption = title ? `✨ ${title}\n\n🤖 Created with AI` : '🤖 Created with AI';

      await createPost.mutateAsync({
        mediaFile: file,
        caption,
        type: 'post',
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
    if (!generatedImageUrl || !onVideoGenerated) return;
    
    try {
      const response = await fetch(generatedImageUrl);
      const blob = await response.blob();
      onVideoGenerated(generatedImageUrl, blob);
    } catch (err) {
      console.error('Error:', err);
      toast.error('Failed to load generated content');
    }
  }, [generatedImageUrl, onVideoGenerated]);

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
            disabled={status === 'generating' || status === 'posting'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

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
                <label className="text-sm font-medium">Describe your content</label>
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
                <Sparkles className="w-4 h-4 mr-2" />
                Generate
              </Button>
            </motion.div>
          )}

          {/* Generating */}
          {status === 'generating' && (
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
                    <Wand2 className="w-8 h-8 text-white" />
                  </div>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    className="absolute -inset-2 border-2 border-primary/30 border-t-primary rounded-full"
                  />
                </div>
                <div className="text-center">
                  <p className="font-medium">Creating your content...</p>
                  <p className="text-sm text-muted-foreground">This may take a moment</p>
                </div>
              </div>

              <p className="text-xs text-center text-muted-foreground px-4">
                "{prompt.slice(0, 60)}{prompt.length > 60 ? '...' : ''}"
              </p>
            </motion.div>
          )}

          {/* Preview - Show generated content with remake option */}
          {status === 'preview' && generatedImageUrl && (
            <motion.div
              key="preview"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <div className="relative rounded-2xl overflow-hidden bg-muted aspect-square">
                <img 
                  src={generatedImageUrl} 
                  alt="AI Generated" 
                  className="w-full h-full object-cover"
                />
                <Badge className="absolute top-3 left-3 bg-gradient-to-r from-violet-500 to-purple-500 text-white border-0">
                  <Bot className="w-3 h-3 mr-1" />
                  AI Generated
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
          {status === 'details' && generatedImageUrl && (
            <motion.div
              key="details"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <div className="relative rounded-2xl overflow-hidden bg-muted aspect-video">
                <img 
                  src={generatedImageUrl} 
                  alt="AI Generated" 
                  className="w-full h-full object-cover"
                />
                <Badge className="absolute top-3 left-3 bg-gradient-to-r from-violet-500 to-purple-500 text-white border-0">
                  <Bot className="w-3 h-3 mr-1" />
                  AI Generated
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
