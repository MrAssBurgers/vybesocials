import { useState } from 'react';
import { motion } from 'framer-motion';
import { Shield, Baby, User, UserCheck, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';

export type AgeRating = 'safe' | '13+' | '18+';

const AGE_RANK: Record<AgeRating, number> = { 'safe': 0, '13+': 1, '18+': 2 };

interface AgeRatingOption {
  id: AgeRating;
  label: string;
  sublabel: string;
  icon: typeof Shield;
  color: string;
  glow: string;
  bg: string;
}

const options: AgeRatingOption[] = [
  {
    id: 'safe',
    label: 'Safe',
    sublabel: 'All ages',
    icon: Baby,
    color: 'text-emerald-400',
    glow: 'shadow-[0_0_20px_rgba(52,211,153,0.4)]',
    bg: 'bg-emerald-500/10 border-emerald-500/30',
  },
  {
    id: '13+',
    label: '13+',
    sublabel: 'Teen content',
    icon: User,
    color: 'text-amber-400',
    glow: 'shadow-[0_0_20px_rgba(251,191,36,0.4)]',
    bg: 'bg-amber-500/10 border-amber-500/30',
  },
  {
    id: '18+',
    label: '18+',
    sublabel: 'Mature themes',
    icon: UserCheck,
    color: 'text-red-400',
    glow: 'shadow-[0_0_20px_rgba(248,113,113,0.4)]',
    bg: 'bg-red-500/10 border-red-500/30',
  },
];

interface AgeRatingSelectorProps {
  onSelect: (rating: AgeRating) => void;
  /** AI-enforced minimum rating — options below this are locked */
  minimumRating?: AgeRating;
}

export function AgeRatingSelector({ onSelect, minimumRating }: AgeRatingSelectorProps) {
  const [selected, setSelected] = useState<AgeRating | null>(null);

  const isLocked = (id: AgeRating) => {
    if (!minimumRating) return false;
    return AGE_RANK[id] < AGE_RANK[minimumRating];
  };

  const handleSelect = (rating: AgeRating) => {
    if (isLocked(rating)) return;
    triggerHaptic('medium');
    setSelected(rating);
    setTimeout(() => onSelect(rating), 600);
  };

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-sm mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-1"
      >
        <h2 className="text-xl font-bold text-foreground">Who can see this?</h2>
        <p className="text-sm text-muted-foreground">Choose an age rating for your content</p>
      </motion.div>

      <div className="flex flex-col gap-3 w-full">
        {options.map((opt, i) => {
          const Icon = opt.icon;
          const isSelected = selected === opt.id;
          const locked = isLocked(opt.id);
          return (
            <motion.button
              key={opt.id}
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + i * 0.12, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              onClick={() => handleSelect(opt.id)}
              className={cn(
                'relative flex items-center gap-4 p-4 rounded-2xl border transition-all duration-300',
                opt.bg,
                locked && 'opacity-30 cursor-not-allowed',
                isSelected && !locked && opt.glow,
                isSelected && !locked && 'ring-2 ring-offset-1 ring-offset-background',
                isSelected && opt.id === 'safe' && 'ring-emerald-400',
                isSelected && opt.id === '13+' && 'ring-amber-400',
                isSelected && opt.id === '18+' && 'ring-red-400',
                !selected && !locked && 'hover:scale-[1.02] active:scale-[0.98]',
                selected && !isSelected && 'opacity-40 scale-95',
              )}
              disabled={!!selected || locked}
            >
              <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center', opt.bg)}>
                {locked ? (
                  <Lock className="w-5 h-5 text-muted-foreground" />
                ) : (
                  <Icon className={cn('w-5 h-5', opt.color)} />
                )}
              </div>
              <div className="text-left flex-1">
                <p className={cn('font-semibold text-base', locked ? 'text-muted-foreground' : opt.color)}>
                  {opt.label}
                </p>
                <p className="text-xs text-muted-foreground">
                  {locked ? 'Restricted by AI analysis' : opt.sublabel}
                </p>
              </div>
              {isSelected && !locked && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className={cn('w-6 h-6 rounded-full flex items-center justify-center', opt.color)}
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </motion.div>
              )}
              {locked && (
                <Lock className="w-4 h-4 text-muted-foreground/50" />
              )}
            </motion.button>
          );
        })}
      </div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="text-xs text-muted-foreground/60 text-center"
      >
        🚫 Nudity is never allowed on VYBE
      </motion.p>
    </div>
  );
}
