import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Globe, Lock, Clock, Bookmark } from 'lucide-react';

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

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card/80 to-accent/10 p-4 backdrop-blur-xl"
      >
        <div className="flex items-start gap-3">
          <div className="relative shrink-0">
            <div className="p-2 rounded-xl bg-primary/15 border border-primary/25">
              <Clock className="w-4 h-4 text-primary" />
            </div>
            <div className="absolute -bottom-1 -right-1 p-1 rounded-full bg-accent/90 border border-background">
              <Bookmark className="w-2.5 h-2.5 text-accent-foreground fill-current" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">Disappearing Messages</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              DMs delete from the chat and our servers <span className="font-semibold text-foreground">48 hours after you open them</span>. Tap any message to save it forever — tap again to unsave.
            </p>
          </div>
        </div>
      </motion.div>

      <p className="text-center text-sm text-muted-foreground">
        {t('onboarding.privacy.canChange')}
      </p>
    </div>
  );
}
