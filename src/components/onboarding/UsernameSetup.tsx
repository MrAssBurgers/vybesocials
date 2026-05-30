import { useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AtSign, Check, X, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface UsernameSetupProps {
  username: string;
  onChange: (username: string) => void;
  onValidChange: (isValid: boolean) => void;
}

export function UsernameSetup({ username, onChange, onValidChange }: UsernameSetupProps) {
  const { t } = useTranslation();
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);

  const validateUsername = async (value: string) => {
    setError('');
    setIsAvailable(null);
    onValidChange(false);

    if (value.length < 3) {
      setError('Username must be at least 3 characters');
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(value)) {
      setError('Only letters, numbers, and underscores allowed');
      return;
    }

    setChecking(true);
    try {
      const normalized = value.toLowerCase().replace(/\s+/g, '');
      const { data: available, error } = await supabase.rpc('is_username_available', {
        p_username: normalized,
      });

      if (error) {
        setError('Error checking username');
        onValidChange(false);
        return;
      }

      if (!available) {
        setError('Username is already taken');
        setIsAvailable(false);
        onValidChange(false);
      } else {
        setIsAvailable(true);
        onValidChange(true);
      }
    } catch (err) {
      setError('Error checking username');
    } finally {
      setChecking(false);
    }
  };

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
              onChange={(e) => {
                const value = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
                onChange(value);
                if (value.length >= 3) {
                  validateUsername(value);
                } else {
                  setIsAvailable(null);
                  onValidChange(false);
                }
              }}
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
          <p className="text-xs text-muted-foreground">
            This will be your unique @handle on VYBE
          </p>
        </div>
      </motion.div>
    </div>
  );
}
