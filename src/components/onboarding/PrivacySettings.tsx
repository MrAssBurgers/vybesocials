import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Globe, Lock } from 'lucide-react';

interface PrivacySettingsProps {
  isPrivate: boolean;
  onChange: (isPrivate: boolean) => void;
}

export function PrivacySettings({ isPrivate, onChange }: PrivacySettingsProps) {
  const { t } = useTranslation();

  const options = [
    {
      id: 'public',
      isPrivate: false,
      icon: Globe,
      title: t('onboarding.privacy.public'),
      description: t('onboarding.privacy.publicDesc'),
    },
    {
      id: 'private',
      isPrivate: true,
      icon: Lock,
      title: t('onboarding.privacy.private'),
      description: t('onboarding.privacy.privateDesc'),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold gradient-text">{t('onboarding.privacy.title')}</h2>
        <p className="text-muted-foreground mt-2">{t('onboarding.privacy.subtitle')}</p>
      </div>

      <div className="space-y-3">
        {options.map((option, index) => {
          const Icon = option.icon;
          const selected = isPrivate === option.isPrivate;
          return (
            <motion.button
              key={option.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              onClick={() => onChange(option.isPrivate)}
              className={cn(
                'w-full p-4 rounded-xl border-2 transition-all text-left',
                'flex items-start gap-4',
                selected
                  ? 'border-primary bg-primary/10'
                  : 'border-border bg-card hover:border-primary/50'
              )}
            >
              <div className={cn(
                'p-2 rounded-lg shrink-0',
                selected ? 'bg-primary text-primary-foreground' : 'bg-muted'
              )}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold">{option.title}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {option.description}
                </p>
              </div>
              {selected && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="w-6 h-6 bg-primary rounded-full flex items-center justify-center shrink-0"
                >
                  <span className="text-xs text-primary-foreground">✓</span>
                </motion.div>
              )}
            </motion.button>
          );
        })}
      </div>

      <p className="text-center text-sm text-muted-foreground">
        {t('onboarding.privacy.canChange')}
      </p>
    </div>
  );
}
