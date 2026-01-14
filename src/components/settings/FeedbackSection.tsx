import { motion } from 'framer-motion';
import { Vibrate, Volume2 } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import { Switch } from '@/components/ui/switch';
import { haptics } from '@/lib/haptics';

export function FeedbackSection() {
  const { hapticsEnabled, setHapticsEnabled, soundsEnabled, setSoundsEnabled } = useTheme();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="liquid-glass-card p-4 sm:p-6"
    >
      <h3 className="font-semibold mb-4 flex items-center gap-2 text-sm sm:text-base">
        <Vibrate className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
        Feedback
      </h3>

      <div className="flex items-center justify-between py-3">
        <div className="min-w-0 flex-1 mr-4">
          <p className="font-medium text-sm sm:text-base">Haptic Feedback</p>
          <p className="text-xs sm:text-sm text-muted-foreground">Vibration on interactions</p>
        </div>
        <Switch 
          checked={hapticsEnabled} 
          onCheckedChange={(checked) => {
            setHapticsEnabled(checked);
            if (checked) haptics.success();
          }} 
        />
      </div>

      <div className="flex items-center justify-between py-3 border-t border-border">
        <div className="min-w-0 flex-1 mr-4">
          <p className="font-medium text-sm sm:text-base flex items-center gap-2">
            <Volume2 className="w-4 h-4" />
            UI Sounds
          </p>
          <p className="text-xs sm:text-sm text-muted-foreground">Subtle interaction sounds</p>
        </div>
        <Switch 
          checked={soundsEnabled} 
          onCheckedChange={(checked) => {
            setSoundsEnabled(checked);
            haptics.tap();
          }} 
        />
      </div>
    </motion.div>
  );
}
