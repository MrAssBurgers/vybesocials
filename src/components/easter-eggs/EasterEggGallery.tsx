import { motion } from 'framer-motion';
import { useEasterEggContext } from './EasterEggProvider';
import { Lock, Unlock } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

export function EasterEggGallery() {
  const { eggs, unlockedCount, totalCount } = useEasterEggContext();
  const progress = (unlockedCount / totalCount) * 100;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2">Easter Eggs</h2>
        <p className="text-muted-foreground mb-4">
          Discover {totalCount} hidden secrets
        </p>
        <div className="flex items-center justify-center gap-4">
          <Progress value={progress} className="w-48 h-2" />
          <span className="text-sm font-medium">
            {unlockedCount}/{totalCount}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {eggs.map((egg, idx) => (
          <motion.div
            key={egg.id}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: idx * 0.05 }}
            className={`relative p-4 rounded-xl border transition-all ${
              egg.unlocked
                ? 'bg-primary/10 border-primary/30'
                : 'bg-muted/50 border-border opacity-60'
            }`}
          >
            <div className="text-center">
              <div className="text-3xl mb-2">
                {egg.unlocked ? egg.icon : '❓'}
              </div>
              <h3 className="font-medium text-sm">
                {egg.unlocked ? egg.name : '???'}
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                {egg.unlocked ? egg.description : 'Keep exploring...'}
              </p>
            </div>
            <div className="absolute top-2 right-2">
              {egg.unlocked ? (
                <Unlock className="h-3 w-3 text-primary" />
              ) : (
                <Lock className="h-3 w-3 text-muted-foreground" />
              )}
            </div>
          </motion.div>
        ))}
      </div>

      <div className="text-center text-sm text-muted-foreground">
        <p>💡 Hint: Try the Konami code, shake your device, or explore at midnight!</p>
      </div>
    </div>
  );
}
