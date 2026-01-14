import { motion } from 'framer-motion';
import { Vibrate, Volume2, Smartphone } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import { Switch } from '@/components/ui/switch';
import { haptics } from '@/lib/haptics';

export function FeedbackSection() {
  const { hapticsEnabled, setHapticsEnabled, soundsEnabled, setSoundsEnabled } = useTheme();

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="liquid-glass-card p-4 sm:p-6"
      >
        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Smartphone className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-base mb-1">Feedback & Sounds</h3>
            <p className="text-sm text-muted-foreground">
              Configure haptic feedback and sound effects
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Haptic Feedback */}
          <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-background flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Vibrate className="w-5 h-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium">Haptic Feedback</p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Feel subtle vibrations when interacting with the app
                  </p>
                </div>
              </div>
              <Switch 
                checked={hapticsEnabled} 
                onCheckedChange={(checked) => {
                  setHapticsEnabled(checked);
                  if (checked) haptics.success();
                }}
                className="mt-1"
              />
            </div>
          </div>

          {/* UI Sounds */}
          <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-background flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Volume2 className="w-5 h-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium">UI Sounds</p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Play subtle sounds for interactions and notifications
                  </p>
                </div>
              </div>
              <Switch 
                checked={soundsEnabled} 
                onCheckedChange={(checked) => {
                  setSoundsEnabled(checked);
                  haptics.tap();
                }}
                className="mt-1"
              />
            </div>
          </div>
        </div>
      </motion.div>

      {/* Info Card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="liquid-glass-card p-4 sm:p-6 bg-muted/20"
      >
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">Tip:</strong> Haptic feedback works best on mobile devices. 
          Sound effects are designed to be subtle and non-intrusive.
        </p>
      </motion.div>
    </div>
  );
}
