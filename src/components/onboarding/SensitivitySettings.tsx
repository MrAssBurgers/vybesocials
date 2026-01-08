import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Shield, Eye, EyeOff } from 'lucide-react';

type SensitivityLevel = 'standard' | 'restricted' | 'open';

const sensitivityOptions: { id: SensitivityLevel; icon: typeof Shield }[] = [
  { id: 'standard', icon: Shield },
  { id: 'restricted', icon: EyeOff },
  { id: 'open', icon: Eye },
];

interface SensitivitySettingsProps {
  value: SensitivityLevel;
  onChange: (value: SensitivityLevel) => void;
}

export function SensitivitySettings({ value, onChange }: SensitivitySettingsProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold gradient-text">{t('onboarding.step4Title')}</h2>
        <p className="text-muted-foreground mt-2">{t('onboarding.step4Subtitle')}</p>
      </div>

      <div className="space-y-3">
        {sensitivityOptions.map((option, index) => {
          const Icon = option.icon;
          return (
            <motion.button
              key={option.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              onClick={() => onChange(option.id)}
              className={cn(
                'w-full p-4 rounded-xl border-2 transition-all text-left',
                'flex items-start gap-4',
                value === option.id
                  ? 'border-primary bg-primary/10'
                  : 'border-border bg-card hover:border-primary/50'
              )}
            >
              <div className={cn(
                'p-2 rounded-lg',
                value === option.id ? 'bg-primary text-primary-foreground' : 'bg-muted'
              )}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="font-semibold">{t(`onboarding.sensitivity.${option.id}`)}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {t(`onboarding.sensitivity.${option.id}Desc`)}
                </p>
              </div>
              {value === option.id && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="w-6 h-6 bg-primary rounded-full flex items-center justify-center"
                >
                  <span className="text-xs text-primary-foreground">✓</span>
                </motion.div>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
