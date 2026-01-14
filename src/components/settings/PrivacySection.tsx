import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Lock } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { getUserFriendlyError } from '@/lib/errorUtils';
import { supabase } from '@/integrations/supabase/client';
import { haptics } from '@/lib/haptics';

export function PrivacySection() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [isPrivate, setIsPrivate] = useState(false);
  const [privacyLoading, setPrivacyLoading] = useState(false);

  useEffect(() => {
    if (profile?.id) {
      supabase
        .from('profiles')
        .select('is_private')
        .eq('id', profile.id)
        .single()
        .then(({ data }) => {
          if (data) {
            setIsPrivate(data.is_private ?? false);
          }
        });
    }
  }, [profile?.id]);

  const handlePrivacyChange = async (value: boolean) => {
    if (!profile?.id) return;
    setPrivacyLoading(true);
    haptics.tap();
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_private: value })
        .eq('id', profile.id);
      
      if (error) throw error;
      setIsPrivate(value);
      toast.success(value ? 'Account set to private' : 'Account set to public');
    } catch (error: any) {
      toast.error(getUserFriendlyError(error));
    } finally {
      setPrivacyLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="liquid-glass-card p-4 sm:p-6"
    >
      <h3 className="font-semibold mb-4 flex items-center gap-2 text-sm sm:text-base">
        <Lock className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
        {t('settings.privacy')}
      </h3>

      <div className="flex items-center justify-between py-3">
        <div className="flex-1 min-w-0 mr-4">
          <p className="font-medium text-sm sm:text-base">{t('settings.privateAccount')}</p>
          <p className="text-xs sm:text-sm text-muted-foreground">{t('settings.privateAccountDesc')}</p>
        </div>
        <Switch 
          checked={isPrivate} 
          onCheckedChange={handlePrivacyChange}
          disabled={privacyLoading}
        />
      </div>
    </motion.div>
  );
}
