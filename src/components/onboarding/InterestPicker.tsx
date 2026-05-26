import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

const interests = [
  { id: 'comedy', emoji: '😂', label: 'Comedy' },
  { id: 'music', emoji: '🎵', label: 'Music' },
  { id: 'dance', emoji: '💃', label: 'Dance' },
  { id: 'gaming', emoji: '🎮', label: 'Gaming' },
  { id: 'sports', emoji: '⚽', label: 'Sports' },
  { id: 'food', emoji: '🍕', label: 'Food' },
  { id: 'travel', emoji: '✈️', label: 'Travel' },
  { id: 'fashion', emoji: '👗', label: 'Fashion' },
  { id: 'beauty', emoji: '💄', label: 'Beauty' },
  { id: 'art', emoji: '🎨', label: 'Art' },
  { id: 'tech', emoji: '💻', label: 'Technology' },
  { id: 'fitness', emoji: '💪', label: 'Fitness' },
  { id: 'animals', emoji: '🐶', label: 'Animals' },
  { id: 'nature', emoji: '🌿', label: 'Nature' },
  { id: 'movies', emoji: '🎬', label: 'Movies' },
  { id: 'books', emoji: '📚', label: 'Books' },
  { id: 'diy', emoji: '🔧', label: 'DIY' },
  { id: 'science', emoji: '🔬', label: 'Science' },
  { id: 'news', emoji: '📰', label: 'News' },
  { id: 'education', emoji: '📖', label: 'Education' },
];

interface InterestPickerProps {
  selected: string[];
  onChange: (interests: string[]) => void;
}

export function InterestPicker({ selected, onChange }: InterestPickerProps) {
  const { t } = useTranslation();

  const toggleInterest = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((i) => i !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold gradient-text">{t('onboarding.step1Title')}</h2>
        <p className="text-muted-foreground mt-2">{t('onboarding.step1Subtitle')}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {interests.map((interest, index) => (
          <motion.button
            key={interest.id}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.03 }}
            onClick={() => toggleInterest(interest.id)}
            className={cn(
              'relative p-4 rounded-xl border-2 transition-all duration-200',
              'flex flex-col items-center gap-2',
              'hover:scale-105 active:scale-95',
              selected.includes(interest.id)
                ? 'border-primary bg-primary/10 shadow-lg shadow-primary/20'
                : 'border-border bg-card hover:border-primary/50'
            )}
          >
            <span className="text-3xl">{interest.emoji}</span>
            <span className="text-sm font-medium">{interest.label}</span>
            {selected.includes(interest.id) && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-1 -right-1 w-5 h-5 bg-primary rounded-full flex items-center justify-center"
              >
                <span className="text-xs text-primary-foreground">✓</span>
              </motion.div>
            )}
          </motion.button>
        ))}
      </div>

      <p className="text-center text-sm text-muted-foreground">
        {selected.length} selected (pick at least 3)
      </p>

      {/* Level-up tip: explain that creator level boosts reach */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mt-4 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-4"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/20 text-lg">
            🚀
          </div>
          <div className="flex-1 space-y-1">
            <h3 className="text-sm font-semibold">Level up = more reach</h3>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Every post you make, comment you leave, and streak you build levels up
              your account. Higher levels boost how far your posts travel — your
              content gets shown to more people from the start. Quality still wins,
              but leveling gives you a head start.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

