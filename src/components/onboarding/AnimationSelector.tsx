import { motion } from 'framer-motion';
import { Check, Zap, Sparkles, Wind, Coffee, Gauge, Ban } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ANIMATION_PRESETS, AnimationPresetKey } from '@/hooks/useApplyThemeFonts';

interface AnimationSelectorProps {
  selectedAnimation: AnimationPresetKey | null;
  onSelect: (animation: AnimationPresetKey) => void;
}

const ANIMATION_ICONS: Record<AnimationPresetKey, typeof Zap> = {
  smooth: Wind,
  bouncy: Sparkles,
  snappy: Gauge,
  zen: Coffee,
  instant: Zap,
  none: Ban,
};

const ANIMATION_COLORS: Record<AnimationPresetKey, string> = {
  smooth: 'from-blue-400 to-cyan-500',
  bouncy: 'from-pink-400 to-purple-500',
  snappy: 'from-yellow-400 to-orange-500',
  zen: 'from-green-400 to-teal-500',
  instant: 'from-red-400 to-orange-500',
  none: 'from-gray-400 to-gray-500',
};

export function AnimationSelector({ selectedAnimation, onSelect }: AnimationSelectorProps) {
  const animationEntries = Object.entries(ANIMATION_PRESETS) as [AnimationPresetKey, typeof ANIMATION_PRESETS[AnimationPresetKey]][];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-foreground">Choose Your Animation Style</h3>
      </div>
      
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {animationEntries.map(([key, preset], index) => {
          const isSelected = selectedAnimation === key;
          const Icon = ANIMATION_ICONS[key];
          const colorClass = ANIMATION_COLORS[key];
          
          // Demo animation based on style
          const demoVariants = {
            smooth: { scale: [1, 1.1, 1], transition: { duration: 2, repeat: Infinity } },
            bouncy: { y: [0, -8, 0], transition: { duration: 0.6, repeat: Infinity } },
            snappy: { rotate: [0, 5, -5, 0], transition: { duration: 0.3, repeat: Infinity, repeatDelay: 1 } },
            zen: { opacity: [0.7, 1, 0.7], transition: { duration: 3, repeat: Infinity } },
            instant: { scale: [1, 0.95, 1], transition: { duration: 0.1, repeat: Infinity, repeatDelay: 1.5 } },
            none: {},
          };
          
          return (
            <motion.button
              key={key}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => onSelect(key)}
              className={cn(
                "relative p-4 rounded-xl transition-all duration-200",
                "border-2 flex flex-col items-center gap-2",
                isSelected 
                  ? "border-primary bg-primary/10 shadow-lg shadow-primary/20"
                  : "border-border bg-card/50 hover:border-primary/50"
              )}
            >
              {/* Animated icon preview */}
              <motion.div
                animate={demoVariants[key]}
                className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center",
                  "bg-gradient-to-br", colorClass
                )}
              >
                <Icon className="h-5 w-5 text-white" />
              </motion.div>
              
              {/* Label */}
              <span className="text-sm font-medium text-center text-foreground">
                {preset.description}
              </span>
              
              {/* Selected indicator */}
              {isSelected && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-primary rounded-full flex items-center justify-center"
                >
                  <Check className="h-3 w-3 text-primary-foreground" />
                </motion.div>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
