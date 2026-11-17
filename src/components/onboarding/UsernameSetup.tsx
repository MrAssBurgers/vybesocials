import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AtSign, Check, X, Loader2 } from 'lucide-react';
import { useOnboardingUsernameCheck } from './useOnboardingUsernameCheck';

interface UsernameSetupProps {
  username: string;
  onChange: (username: string) => void;
  onValidChange: (isValid: boolean) => void;
}

export function UsernameSetup({ username, onChange, onValidChange }: UsernameSetupProps) {
  const { t } = useTranslation();
  const { changeUsername, checking, error, available: isAvailable } = useOnboardingUsernameCheck(onChange, onValidChange);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold gradient-text">{t('onboarding.chooseUsername')}</h2>
        <p className="text-muted-foreground mt-2">{t('onboarding.usernameSubtitle')}</p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4"
      >
        <div className="space-y-2">
          <Label htmlFor="username" className="flex items-center gap-2">
            <AtSign className="w-4 h-4" />
            {t('auth.username')}
          </Label>
          <div className="relative">
            <Input
              id="username"
              placeholder="your_username"
              value={username}
              onChange={event => void changeUsername(event.target.value)}
              className="bg-card border-border pr-10"
              maxLength={20}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {checking && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
              {!checking && isAvailable === true && <Check className="w-4 h-4 text-primary" />}
              {!checking && isAvailable === false && <X className="w-4 h-4 text-destructive" />}
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {isAvailable && <p className="text-sm text-primary">Username is available!</p>}
        </div>
      </motion.div>
    </div>
  );
}
