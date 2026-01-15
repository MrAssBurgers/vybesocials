import { motion } from 'framer-motion';
import { Vibrate, Smartphone } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import { Switch } from '@/components/ui/switch';
import { haptics } from '@/lib/haptics';
import { NotificationSoundSection } from './NotificationSoundSection';

export function FeedbackSection() {
  const { hapticsEnabled, setHapticsEnabled } = useTheme();

  return (
    <div className="space-y-6">
      {/* Haptic Feedback */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="liquid-glass-card p-4 sm:p-6"
      >
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Vibrate className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-base mb-1">Haptic Feedback</h3>
            <p className="text-sm text-muted-foreground">
              Feel subtle vibrations when interacting
            </p>
          </div>
          <Switch 
            checked={hapticsEnabled} 
            onCheckedChange={(checked) => {
              setHapticsEnabled(checked);
              if (checked) haptics.success();
            }}
          />
        </div>
      </motion.div>

      {/* Sound Settings */}
      <NotificationSoundSection />

      {/* Info Card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="liquid-glass-card p-4 sm:p-6 bg-muted/20"
      >
        <div className="flex items-start gap-3">
          <Smartphone className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
          <p className="text-sm text-muted-foreground">
            Haptic feedback works best on mobile devices. All feedback is designed to be subtle and enhance your experience.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
