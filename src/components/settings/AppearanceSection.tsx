import { useTranslation } from 'react-i18next';
import { Sun, Moon, Monitor, Zap, Layers, Contrast, Paintbrush, Sparkles } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import { useGlassIntensity } from '@/components/ui/glass/GlassIntensityProvider';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';
import { SettingsSectionCard, SettingsPanel, SettingsToggleRow } from './SettingsUI';

export function AppearanceSection() {
  const { t } = useTranslation();
  const {
    theme,
    setTheme,
    reducedMotion,
    setReducedMotion,
    motionIntensity,
    setMotionIntensity,
  } = useTheme();
  const { intensity, setIntensity, contrast, setContrast } = useGlassIntensity();

  return (
    <div className="space-y-6">
      <SettingsSectionCard
        icon={Paintbrush}
        title={t('settings.theme')}
        description="Choose your preferred color mode"
      >
        <div className="grid grid-cols-3 gap-3">
          {[
            { id: 'dark', icon: Moon, label: t('settings.darkMode'), desc: 'Easy on eyes' },
            { id: 'light', icon: Sun, label: t('settings.lightMode'), desc: 'Bright & clear' },
            { id: 'system', icon: Monitor, label: t('settings.systemDefault'), desc: 'Auto switch' },
          ].map((option) => (
            <button
              key={option.id}
              type="button"
              data-active={theme === option.id}
              onClick={() => {
                haptics.tap();
                setTheme(option.id as 'dark' | 'light' | 'system');
                toast.success(`Switched to ${option.label}`);
              }}
              className={cn(
                'settings-segment-btn flex flex-col items-center gap-2 p-4 rounded-xl active:scale-95'
              )}
            >
              <div
                className={cn(
                  'w-12 h-12 rounded-xl flex items-center justify-center transition-colors',
                  theme === option.id ? 'bg-primary text-primary-foreground' : 'bg-foreground/[0.06]'
                )}
              >
                <option.icon className="w-6 h-6" />
              </div>
              <div className="text-center">
                <p className="font-medium text-sm">{option.label}</p>
                <p className="text-xs text-muted-foreground">{option.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </SettingsSectionCard>

      <SettingsSectionCard
        icon={Sparkles}
        iconClassName="from-accent/20 to-primary/10 ring-accent/25"
        title="Visual Effects"
        description="Customize animations and glass styling"
        delay={0.1}
      >
        <div className="space-y-6">
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
                  type="button"
                  data-active={motionIntensity === option.id}
                  onClick={() => {
                    haptics.tap();
                    setMotionIntensity(option.id as 'calm' | 'normal');
                  }}
                  className="settings-segment-btn p-3 rounded-xl text-left active:scale-95"
                >
                  <p className="font-medium text-sm">{option.label}</p>
                  <p className="text-xs text-muted-foreground">{option.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-foreground/[0.06]">
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
                  type="button"
                  data-active={intensity === option.id}
                  onClick={() => {
                    haptics.tap();
                    setIntensity(option.id as 'calm' | 'normal' | 'max');
                    toast.success(`Glass set to ${option.label}`);
                  }}
                  className="settings-segment-btn p-3 rounded-xl text-sm font-medium active:scale-95"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-foreground/[0.06]">
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
                  type="button"
                  data-active={contrast === option.id}
                  onClick={() => {
                    haptics.tap();
                    setContrast(option.id as 'normal' | 'high');
                    toast.success(`Contrast set to ${option.label}`);
                  }}
                  className="settings-segment-btn p-3 rounded-xl text-left active:scale-95"
                >
                  <p className="font-medium text-sm">{option.label}</p>
                  <p className="text-xs text-muted-foreground">{option.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <SettingsPanel className="mt-2">
            <SettingsToggleRow
              title={t('settings.reducedMotion')}
              description="Minimize all animations"
              checked={reducedMotion}
              onCheckedChange={(checked) => {
                haptics.tap();
                setReducedMotion(checked);
              }}
            />
          </SettingsPanel>
        </div>
      </SettingsSectionCard>
    </div>
  );
}
