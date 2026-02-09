import { memo } from 'react';
import { motion } from 'framer-motion';
import { Textarea } from '@/components/ui/textarea';
import { Sparkles, Zap, Wind, Waves, Flame, Snowflake, Star, Heart, Feather, Rocket } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CustomAnimationInputProps {
  value: string;
  onChange: (value: string) => void;
}

// Quick animation suggestions
const ANIMATION_SUGGESTIONS = [
  { label: 'Floating gently', icon: Feather, prompt: 'elements float gently up and down like feathers in the wind' },
  { label: 'Pulsing glow', icon: Heart, prompt: 'soft pulsing glow effect like a heartbeat' },
  { label: 'Electric sparks', icon: Zap, prompt: 'electric sparking effects with quick flashes' },
  { label: 'Ocean waves', icon: Waves, prompt: 'smooth wave-like motion flowing side to side' },
  { label: 'Flame flicker', icon: Flame, prompt: 'flickering flame-like movement with warm energy' },
  { label: 'Snowfall drift', icon: Snowflake, prompt: 'gentle drifting like snowflakes falling slowly' },
  { label: 'Cosmic sparkle', icon: Star, prompt: 'twinkling stars with random sparkle effects' },
  { label: 'Rocket launch', icon: Rocket, prompt: 'energetic upward motion with trailing effects' },
  { label: 'Wind breeze', icon: Wind, prompt: 'subtle swaying motion like leaves in a gentle breeze' },
  { label: 'Magic dust', icon: Sparkles, prompt: 'floating magic particles with shimmer and fade' },
];

export const CustomAnimationInput = memo(function CustomAnimationInput({
  value,
  onChange,
}: CustomAnimationInputProps) {
  const handleSuggestionClick = (prompt: string) => {
    onChange(value ? `${value}, ${prompt}` : prompt);
  };

  return (
    <div className="w-full max-w-lg mx-auto space-y-4">
      {/* Animation description textarea */}
      <div className="relative">
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Describe your dream animation... e.g., 'buttons should bounce playfully when hovered' or 'everything should have a dreamy floating effect'"
          className="min-h-[120px] text-base resize-none text-foreground pr-12"
          maxLength={300}
        />
        <div className="absolute bottom-3 right-3 text-xs text-foreground/50">
          {value.length}/300
        </div>
      </div>

      {/* Quick suggestions */}
      <div className="space-y-2">
        <p className="text-sm text-foreground/60 text-center">Or pick an animation style:</p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {ANIMATION_SUGGESTIONS.map((suggestion, index) => {
            const Icon = suggestion.icon;
            const isActive = value.includes(suggestion.prompt);
            
            return (
              <motion.button
                key={suggestion.label}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.03 }}
                onClick={() => handleSuggestionClick(suggestion.prompt)}
                className={cn(
                  "flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all duration-200",
                  "border text-center",
                  isActive 
                    ? "border-primary bg-primary/10 text-primary" 
                    : "border-border bg-card/50 hover:border-primary/50 text-foreground/80 hover:text-foreground"
                )}
              >
                <motion.div
                  animate={isActive ? { 
                    scale: [1, 1.2, 1],
                    rotate: [0, 10, -10, 0]
                  } : {}}
                  transition={{ duration: 0.5, repeat: isActive ? Infinity : 0, repeatDelay: 2 }}
                >
                  <Icon className="h-5 w-5" />
                </motion.div>
                <span className="text-xs font-medium leading-tight">{suggestion.label}</span>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Preview hint */}
      {value && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center text-sm text-foreground/60 bg-primary/5 rounded-lg p-3 border border-primary/20"
        >
          <Sparkles className="inline h-4 w-4 mr-1.5 text-primary" />
          AI will create custom CSS animations based on your description
        </motion.div>
      )}
    </div>
  );
});

export default CustomAnimationInput;
