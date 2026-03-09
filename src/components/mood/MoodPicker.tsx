import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useSetMood, MoodType, MOOD_THEMES, useCurrentMood } from '@/hooks/useMoodMorphing';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const MOODS: MoodType[] = ['energetic', 'chill', 'focused', 'social', 'creative', 'neutral'];

interface MoodPickerProps {
  onSelect?: () => void;
  compact?: boolean;
}

export function MoodPicker({ onSelect, compact }: MoodPickerProps) {
  const { data: currentMood } = useCurrentMood();
  const setMood = useSetMood();

  const handleSelect = (mood: MoodType) => {
    setMood.mutate({ mood }, {
      onSuccess: () => {
        toast.success(`Mood set to ${mood}!`);
        onSelect?.();
      },
    });
  };

  return (
    <div className={cn(
      "grid gap-3",
      compact ? "grid-cols-6" : "grid-cols-3"
    )}>
      {MOODS.map((mood) => {
        const theme = MOOD_THEMES[mood];
        const isActive = currentMood?.mood === mood;

        return (
          <motion.button
            key={mood}
            onClick={() => handleSelect(mood)}
            whileTap={{ scale: 0.9 }}
            className={cn(
              "relative rounded-2xl p-4 transition-all",
              compact ? "p-2" : "p-4",
              isActive 
                ? `bg-gradient-to-br ${theme.gradient} text-white shadow-lg` 
                : "bg-muted/50 hover:bg-muted"
            )}
          >
            <div className={cn(
              "flex flex-col items-center gap-2",
              compact && "gap-1"
            )}>
              <span className={compact ? "text-xl" : "text-3xl"}>{theme.emoji}</span>
              {!compact && (
                <span className={cn(
                  "text-sm font-medium capitalize",
                  !isActive && "text-muted-foreground"
                )}>
                  {mood}
                </span>
              )}
            </div>

            {isActive && (
              <motion.div
                layoutId="moodIndicator"
                className="absolute inset-0 rounded-2xl ring-2 ring-white/50"
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              />
            )}
          </motion.button>
        );
      })}
    </div>
  );
}

/**
 * Floating mood indicator that shows current mood
 */
export function MoodIndicator() {
  const { mood, theme } = useMoodMorphingHook();

  return (
    <motion.div
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm",
        `bg-gradient-to-r ${theme.gradient} text-white`
      )}
      animate={{ scale: [1, 1.02, 1] }}
      transition={{ duration: 2, repeat: Infinity }}
    >
      <span>{theme.emoji}</span>
      <span className="font-medium capitalize">{mood}</span>
    </motion.div>
  );
}

// Re-export hook for convenience
import { useMoodTheme as useMoodMorphingHook } from '@/hooks/useMoodMorphing';
