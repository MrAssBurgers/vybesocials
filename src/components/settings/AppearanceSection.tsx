import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Sun, Moon, Monitor, Zap, Layers, Contrast } from 'lucide-react';
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
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="liquid-glass-card p-4 sm:p-6"
    >
      <h3 className="font-semibold mb-4 flex items-center gap-2 text-sm sm:text-base">
        <Sun className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
        {t('settings.appearance')}
      </h3>

      {/* Theme Selection */}
      <div className="space-y-3 mb-6">
        <Label className="text-sm font-medium">{t('settings.theme')}</Label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { id: 'dark', icon: Moon, label: t('settings.darkMode') },
            { id: 'light', icon: Sun, label: t('settings.lightMode') },
            { id: 'system', icon: Monitor, label: t('settings.systemDefault') },
          ].map((option) => (
            <button
              key={option.id}
              onClick={() => {
                haptics.tap();
                setTheme(option.id as 'dark' | 'light' | 'system');
              }}
              className={cn(
                'flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all active:scale-95',
                theme === option.id
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:border-primary/50 hover:bg-muted/50'
              )}
            >
              <option.icon className="w-5 h-5" />
              <span className="text-xs text-center leading-tight">{option.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Motion Intensity */}
      <div className="space-y-3 mb-6 pt-4 border-t border-border">
        <Label className="text-sm flex items-center gap-2">
          <Zap className="w-4 h-4" />
          Motion Intensity
        </Label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { id: 'calm', label: 'Calm' },
            { id: 'normal', label: 'Normal' },
          ].map((option) => (
            <button
              key={option.id}
              onClick={() => {
                haptics.tap();
                setMotionIntensity(option.id as 'calm' | 'normal');
              }}
              className={cn(
                'p-3 rounded-lg border transition-all text-sm active:scale-95',
                motionIntensity === option.id
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:border-primary/50'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Glass Intensity */}
      <div className="space-y-3 mb-6 pt-4 border-t border-border">
        <Label className="text-sm flex items-center gap-2">
          <Layers className="w-4 h-4" />
          Glass Intensity
        </Label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { id: 'calm', label: 'Calm' },
            { id: 'normal', label: 'Normal' },
            { id: 'max', label: 'Max' },
          ].map((option) => (
            <button
              key={option.id}
              onClick={() => {
                haptics.tap();
                setIntensity(option.id as 'calm' | 'normal' | 'max');
                toast.success(`Glass set to ${option.label}`);
              }}
              className={cn(
                'p-3 rounded-lg border transition-all text-sm active:scale-95',
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
      <div className="space-y-3 mb-6 pt-4 border-t border-border">
        <Label className="text-sm flex items-center gap-2">
          <Contrast className="w-4 h-4" />
          Contrast Mode
        </Label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { id: 'normal', label: 'Normal' },
            { id: 'high', label: 'High' },
          ].map((option) => (
            <button
              key={option.id}
              onClick={() => {
                haptics.tap();
                setContrast(option.id as 'normal' | 'high');
                toast.success(`Contrast set to ${option.label}`);
              }}
              className={cn(
                'p-3 rounded-lg border transition-all text-sm active:scale-95',
                contrast === option.id
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:border-primary/50'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">High contrast improves readability on mobile</p>
      </div>

      {/* Reduced Motion */}
      <div className="flex items-center justify-between py-3 border-t border-border">
        <div className="min-w-0 flex-1 mr-3">
          <p className="font-medium text-sm sm:text-base">{t('settings.reducedMotion')}</p>
          <p className="text-xs sm:text-sm text-muted-foreground">Reduce all animations</p>
        </div>
        <Switch 
          checked={reducedMotion} 
          onCheckedChange={(checked) => {
            haptics.tap();
            setReducedMotion(checked);
          }} 
        />
      </div>
    </motion.div>
  );
}
