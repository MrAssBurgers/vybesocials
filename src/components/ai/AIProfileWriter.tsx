import { useState, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Loader2, Check, RefreshCw, User, PenLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { getFunctionAuthHeaders } from '@/lib/functionAuth';
import { liquidSpring } from '@/motion/liquidConfig';
import { triggerHaptic } from '@/lib/haptics';

interface AIProfileWriterProps {
  currentBio?: string;
  displayName?: string;
  interests?: string[];
  onSelectBio: (bio: string) => void;
  onSelectDisplayName?: (name: string) => void;
}

export const AIProfileWriter = memo(function AIProfileWriter({
  currentBio,
  displayName,
  interests,
  onSelectBio,
  onSelectDisplayName,
}: AIProfileWriterProps) {
  const [bios, setBios] = useState<string[]>([]);
  const [suggestedName, setSuggestedName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedBioIndex, setSelectedBioIndex] = useState<number | null>(null);

  const generate = async () => {
    setIsLoading(true);
    setSelectedBioIndex(null);
    triggerHaptic('light');

    try {
      const headers = await getFunctionAuthHeaders();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-profile-writer`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            currentBio,
            displayName,
            interests,
          }),
        }
      );

      if (!response.ok) {
        if (response.status === 429) { toast.error('Too many requests.'); return; }
        if (response.status === 402) { toast.error('AI credits exhausted.'); return; }
        throw new Error('Failed to generate');
      }

      const data = await response.json();
      setBios(data.bios || []);
      setSuggestedName(data.displayName || '');
    } catch (error) {
      console.error('Profile writer error:', error);
      toast.error('Failed to generate profile suggestions');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectBio = (index: number) => {
    setSelectedBioIndex(index);
    onSelectBio(bios[index]);
    triggerHaptic('success');
    toast.success('Bio applied!');
  };

  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={generate}
        disabled={isLoading}
        className="gap-2 rounded-full"
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : bios.length > 0 ? (
          <RefreshCw className="h-4 w-4" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
        {isLoading ? 'Writing...' : bios.length > 0 ? 'Regenerate' : 'AI Write Bio'}
      </Button>

      <AnimatePresence>
        {bios.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2"
          >
            {/* Suggested display name */}
            {suggestedName && onSelectDisplayName && (
              <motion.button
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                type="button"
                onClick={() => {
                  onSelectDisplayName(suggestedName);
                  triggerHaptic('light');
                  toast.success('Display name applied!');
                }}
                className="w-full text-left p-2.5 rounded-lg border border-dashed border-accent/30 hover:border-accent bg-accent/5 transition-all flex items-center gap-2"
              >
                <User className="h-4 w-4 text-accent shrink-0" />
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Suggested Name</p>
                  <p className="text-sm font-medium">{suggestedName}</p>
                </div>
              </motion.button>
            )}

            {/* Bio options */}
            {bios.map((bio, index) => (
              <motion.button
                key={index}
                type="button"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.08 }}
                onClick={() => handleSelectBio(index)}
                className={`w-full text-left p-3 rounded-xl border transition-all ${
                  selectedBioIndex === index
                    ? 'border-primary bg-primary/10 shadow-sm'
                    : 'border-border hover:border-muted-foreground bg-muted/30'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <PenLine className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <p className="text-sm leading-relaxed">{bio}</p>
                  </div>
                  {selectedBioIndex === index && (
                    <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  )}
                </div>
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
