import { motion } from 'framer-motion';
import { Shield, Eye, Brain, AudioLines, Check } from 'lucide-react';

export type ScanPhase = 'init' | 'nsfwjs' | 'ai-visual' | 'ai-audio' | 'done';

interface Props {
  phase: ScanPhase;
  isVideo?: boolean;
}

const IMAGE_PHASES: { key: ScanPhase; label: string; icon: typeof Shield }[] = [
  { key: 'nsfwjs', label: 'Quick scan', icon: Eye },
  { key: 'ai-visual', label: 'Deep analysis', icon: Brain },
  { key: 'done', label: 'Complete', icon: Check },
];

const VIDEO_PHASES: { key: ScanPhase; label: string; icon: typeof Shield }[] = [
  { key: 'nsfwjs', label: 'Frame scan', icon: Eye },
  { key: 'ai-visual', label: 'Visual analysis', icon: Brain },
  { key: 'ai-audio', label: 'Audio check', icon: AudioLines },
  { key: 'done', label: 'Complete', icon: Check },
];

function getPhaseIndex(phase: ScanPhase, phases: { key: ScanPhase }[]) {
  const idx = phases.findIndex(p => p.key === phase);
  return idx >= 0 ? idx : 0;
}

export function SafetyScanProgress({ phase, isVideo = false }: Props) {
  const phases = isVideo ? VIDEO_PHASES : IMAGE_PHASES;
  const currentIdx = getPhaseIndex(phase, phases);
  const progressPercent = phase === 'done' ? 100 : ((currentIdx) / (phases.length - 1)) * 100;

  return (
    <div className="w-full space-y-3">
      {/* Progress bar */}
      <div className="relative h-2 rounded-full bg-muted/50 overflow-hidden">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary via-accent to-primary"
          initial={{ width: '0%' }}
          animate={{ width: `${progressPercent}%` }}
          transition={{ duration: 0.6, ease: 'easeInOut' }}
        />
        {phase !== 'done' && (
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full bg-primary/30"
            animate={{ width: [`${progressPercent}%`, `${Math.min(progressPercent + 15, 100)}%`, `${progressPercent}%`] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
      </div>

      {/* Phase indicators */}
      <div className="flex items-center justify-between">
        {phases.map((p, i) => {
          const isDone = i < currentIdx || phase === 'done';
          const isActive = i === currentIdx && phase !== 'done';
          const Icon = p.icon;

          return (
            <div key={p.key} className="flex flex-col items-center gap-1">
              <motion.div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs transition-colors ${
                  isDone 
                    ? 'bg-primary text-primary-foreground' 
                    : isActive 
                      ? 'bg-primary/20 text-primary border border-primary/50' 
                      : 'bg-muted/30 text-muted-foreground'
                }`}
                animate={isActive ? { scale: [1, 1.15, 1] } : {}}
                transition={isActive ? { duration: 1, repeat: Infinity } : {}}
              >
                {isDone ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
              </motion.div>
              <span className={`text-[10px] font-medium ${isActive ? 'text-primary' : isDone ? 'text-foreground' : 'text-muted-foreground'}`}>
                {p.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
