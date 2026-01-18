import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Sun, Moon, Monitor, Zap, Layers, Contrast, Paintbrush, Sparkles } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import { useGlassIntensity } from '@/components/ui/glass/GlassIntensityProvider';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';

export function AppearanceSection() {
  const { t } = useTranslation();
  const { 
    theme, setTheme, 
    reducedMotion, setReducedMotion,
    motionIntensity, setMotionIntensity,
  } = useTheme();
  const { intensity, setIntensity, contrast, setContrast } = useGlassIntensity();

  return (
    <div className="space-y-6">
      {/* Theme Selection */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="liquid-glass-card p-4 sm:p-6"
      >
        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Paintbrush className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-base mb-1">{t('settings.theme')}</h3>
            <p className="text-sm text-muted-foreground">Choose your preferred color mode</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { id: 'dark', icon: Moon, label: t('settings.darkMode'), desc: 'Easy on eyes' },
            { id: 'light', icon: Sun, label: t('settings.lightMode'), desc: 'Bright & clear' },
            { id: 'system', icon: Monitor, label: t('settings.systemDefault'), desc: 'Auto switch' },
          ].map((option) => (
            <button
              key={option.id}
              onClick={() => {
                haptics.tap();
                setTheme(option.id as 'dark' | 'light' | 'system');
              }}
              className={cn(
                'flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200 active:scale-95',
                theme === option.id
                  ? 'border-primary bg-primary/10 shadow-lg shadow-primary/10'
                  : 'border-border hover:border-primary/50 hover:bg-muted/50'
              )}
            >
              <div className={cn(
                'w-12 h-12 rounded-xl flex items-center justify-center transition-colors',
                theme === option.id ? 'bg-primary text-primary-foreground' : 'bg-muted'
              )}>
                <option.icon className="w-6 h-6" />
              </div>
              <div className="text-center">
                <p className="font-medium text-sm">{option.label}</p>
                <p className="text-xs text-muted-foreground">{option.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </motion.div>

      {/* Visual Effects */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="liquid-glass-card p-4 sm:p-6"
      >
        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-6 h-6 text-accent" />
          </div>
          <div>
            <h3 className="font-semibold text-base mb-1">Visual Effects</h3>
            <p className="text-sm text-muted-foreground">Customize animations and effects</p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Motion Intensity */}
          <div className="space-y-3">
            <Label className="text-sm flex items-center gap-2 font-medium">
              <Zap className="w-4 h-4 text-muted-foreground" />
              Motion Intensity
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'calm', label: 'Calm', desc: 'Subtle animations' },
                { id: 'normal', label: 'Normal', desc: 'Full animations' },
              ].map((option) => (
                <button
                  key={option.id}
                  onClick={() => {
                    haptics.tap();
                    setMotionIntensity(option.id as 'calm' | 'normal');
                  }}
                  className={cn(
                    'p-3 rounded-xl border-2 transition-all text-left active:scale-95',
                    motionIntensity === option.id
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50'
                  )}
                >
                  <p className="font-medium text-sm">{option.label}</p>
                  <p className="text-xs text-muted-foreground">{option.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Glass Intensity */}
          <div className="space-y-3 pt-4 border-t border-border">
            <Label className="text-sm flex items-center gap-2 font-medium">
              <Layers className="w-4 h-4 text-muted-foreground" />
              Glass Intensity
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'calm', label: 'Subtle' },
                { id: 'normal', label: 'Normal' },
                { id: 'max', label: 'Maximum' },
              ].map((option) => (
                <button
                  key={option.id}
                  onClick={() => {
                    haptics.tap();
                    setIntensity(option.id as 'calm' | 'normal' | 'max');
                    toast.success(`Glass set to ${option.label}`);
                  }}
                  className={cn(
                    'p-3 rounded-xl border-2 transition-all text-sm font-medium active:scale-95',
                    intensity === option.id
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Contrast Mode */}
          <div className="space-y-3 pt-4 border-t border-border">
            <Label className="text-sm flex items-center gap-2 font-medium">
              <Contrast className="w-4 h-4 text-muted-foreground" />
              Contrast Mode
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'normal', label: 'Normal', desc: 'Standard contrast' },
                { id: 'high', label: 'High', desc: 'Better readability' },
              ].map((option) => (
                <button
                  key={option.id}
                  onClick={() => {
                    haptics.tap();
                    setContrast(option.id as 'normal' | 'high');
                    toast.success(`Contrast set to ${option.label}`);
                  }}
                  className={cn(
                    'p-3 rounded-xl border-2 transition-all text-left active:scale-95',
                    contrast === option.id
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50'
                  )}
                >
                  <p className="font-medium text-sm">{option.label}</p>
                  <p className="text-xs text-muted-foreground">{option.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Reduced Motion */}
          <div className="pt-4">
            <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30">
              <div className="min-w-0 flex-1 mr-3">
                <p className="font-medium text-sm">{t('settings.reducedMotion')}</p>
                <p className="text-xs text-muted-foreground">Minimize all animations</p>
              </div>
              <Switch 
                checked={reducedMotion} 
                onCheckedChange={(checked) => {
                  haptics.tap();
                  setReducedMotion(checked);
                }} 
              />
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
