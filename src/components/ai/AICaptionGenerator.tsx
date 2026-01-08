import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Loader2, RefreshCw, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface AICaptionGeneratorProps {
  tags: string[];
  contentType: 'post' | 'short' | 'video';
  onSelectCaption: (caption: string) => void;
}

export function AICaptionGenerator({ tags, contentType, onSelectCaption }: AICaptionGeneratorProps) {
  const [captions, setCaptions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const generateCaptions = async () => {
    setIsLoading(true);
    setCaptions([]);
    setSelectedIndex(null);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-caption`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ tags, contentType }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        if (response.status === 429) {
          toast.error('Too many requests. Please wait a moment.');
          return;
        }
        if (response.status === 402) {
          toast.error('AI credits exhausted. Please try again later.');
          return;
        }
        throw new Error(error.error || 'Failed to generate captions');
      }

      const data = await response.json();
      setCaptions(data.captions || []);
    } catch (error) {
      console.error('Caption generation error:', error);
      toast.error('Failed to generate captions');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelect = (index: number) => {
    setSelectedIndex(index);
    onSelectCaption(captions[index]);
    toast.success('Caption applied!');
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={generateCaptions}
          disabled={isLoading}
          className="gap-2"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : captions.length > 0 ? (
            <RefreshCw className="h-4 w-4" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {isLoading ? 'Generating...' : captions.length > 0 ? 'Regenerate' : 'AI Caption'}
        </Button>
        {tags.length > 0 && (
          <span className="text-xs text-muted-foreground">
            Based on: {tags.slice(0, 3).map(t => `#${t}`).join(' ')}
          </span>
        )}
      </div>

      <AnimatePresence>
        {captions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2"
          >
            {captions.map((caption, index) => (
              <motion.button
                key={index}
                type="button"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                onClick={() => handleSelect(index)}
                className={`w-full text-left p-3 rounded-lg border transition-all ${
                  selectedIndex === index
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-muted-foreground bg-muted/50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm">{caption}</p>
                  {selectedIndex === index && (
                    <Check className="h-4 w-4 text-primary shrink-0" />
                  )}
                </div>
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
