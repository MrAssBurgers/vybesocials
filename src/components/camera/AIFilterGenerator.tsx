import { useState, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Loader2, Send, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAIFilterGenerator } from '@/hooks/useAIFilterGenerator';
import { ARFilterDef } from '@/lib/arFilters';
import { triggerHaptic } from '@/lib/haptics';

const QUICK_PROMPTS = [
  { label: '🌊 Ocean', prompt: 'Underwater ocean theme with blue glow and bubble particles' },
  { label: '🌸 Sakura', prompt: 'Japanese cherry blossom with pink petals falling and soft warm light' },
  { label: '⚡ Electric', prompt: 'Electric lightning energy with purple and blue sparks around the face' },
  { label: '🌈 Rainbow', prompt: 'Colorful rainbow glow with prismatic light and sparkle particles' },
  { label: '❄️ Frost', prompt: 'Ice frost effect with cool blue tones and snowflake particles' },
  { label: '🎵 Music', prompt: 'Music visualizer with neon note particles and rhythmic glow' },
];

interface AIFilterGeneratorProps {
  onFilterGenerated: (filter: ARFilterDef) => void;
  generatedFilters: ARFilterDef[];
  currentFilter: string | null;
  onFilterChange: (filter: ARFilterDef | null) => void;
}

export const AIFilterGenerator = memo(function AIFilterGenerator({
  onFilterGenerated,
  generatedFilters,
  currentFilter,
  onFilterChange,
}: AIFilterGeneratorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const { generateFilter, isGenerating } = useAIFilterGenerator();

  const handleGenerate = async (prompt: string) => {
    triggerHaptic('medium');
    const filter = await generateFilter(prompt);
    if (filter) {
      onFilterGenerated(filter);
      onFilterChange(filter);
      setCustomPrompt('');
    }
  };

  return (
    <div className="w-full">
      {/* Toggle button */}
      <button
        onClick={() => { setIsOpen(!isOpen); triggerHaptic('light'); }}
        className={cn(
          "mx-auto flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full transition-all",
          isOpen
            ? "bg-primary/20 text-primary"
            : "bg-white/10 text-white/60 hover:bg-white/15"
        )}
      >
        <Sparkles className="w-3 h-3" />
        AI Create
        {isGenerating && <Loader2 className="w-3 h-3 animate-spin" />}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="pt-2 px-4 space-y-2">
              {/* Quick prompts */}
              <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
                {QUICK_PROMPTS.map((qp) => (
                  <button
                    key={qp.label}
                    onClick={() => handleGenerate(qp.prompt)}
                    disabled={isGenerating}
                    className="flex-shrink-0 text-[10px] px-2.5 py-1.5 rounded-full bg-white/10 text-white/80 hover:bg-white/20 active:scale-95 transition-all disabled:opacity-40"
                  >
                    {qp.label}
                  </button>
                ))}
              </div>

              {/* Custom prompt input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && customPrompt.trim() && handleGenerate(customPrompt)}
                  placeholder="Describe your filter..."
                  className="flex-1 bg-white/10 text-white text-xs rounded-full px-3 py-2 placeholder:text-white/30 outline-none focus:ring-1 focus:ring-primary/50"
                  disabled={isGenerating}
                />
                <button
                  onClick={() => customPrompt.trim() && handleGenerate(customPrompt)}
                  disabled={isGenerating || !customPrompt.trim()}
                  className="w-8 h-8 rounded-full bg-primary/80 text-primary-foreground flex items-center justify-center disabled:opacity-30 active:scale-90 transition-transform"
                >
                  {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                </button>
              </div>

              {/* Generated filters */}
              {generatedFilters.length > 0 && (
                <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                  {generatedFilters.map((filter) => {
                    const isActive = currentFilter === filter.id;
                    return (
                      <button
                        key={filter.id}
                        onClick={() => {
                          onFilterChange(isActive ? null : filter);
                          triggerHaptic('medium');
                        }}
                        className="flex-shrink-0 flex flex-col items-center gap-0.5"
                      >
                        <div className={cn(
                          "w-12 h-12 rounded-xl flex items-center justify-center text-lg border-2 transition-all relative",
                          isActive
                            ? "border-primary bg-primary/20 scale-105 shadow-lg shadow-primary/30"
                            : "border-white/20 bg-white/10 active:scale-95"
                        )}>
                          {filter.icon}
                          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-primary flex items-center justify-center">
                            <Sparkles className="w-2 h-2 text-primary-foreground" />
                          </span>
                        </div>
                        <span className={cn(
                          "text-[9px] font-medium max-w-[48px] truncate",
                          isActive ? "text-primary" : "text-white/40"
                        )}>
                          {filter.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
