import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Lock, Eye, EyeOff, Shield, Users } from 'lucide-react';
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
      haptics.success();
      toast.success(value ? 'Account set to private' : 'Account set to public');
    } catch (error: any) {
      haptics.error();
      toast.error(getUserFriendlyError(error));
    } finally {
      setPrivacyLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Privacy Overview Card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="liquid-glass-card p-4 sm:p-6"
      >
        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Shield className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-base mb-1">Privacy & Security</h3>
            <p className="text-sm text-muted-foreground">
              Control who can see your content and interact with you
            </p>
          </div>
        </div>

        {/* Private Account Toggle */}
        <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-background flex items-center justify-center flex-shrink-0 mt-0.5">
                {isPrivate ? (
                  <EyeOff className="w-5 h-5 text-primary" />
                ) : (
                  <Eye className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0">
                <p className="font-medium">{t('settings.privateAccount')}</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {t('settings.privateAccountDesc')}
                </p>
              </div>
            </div>
            <Switch 
              checked={isPrivate} 
              onCheckedChange={handlePrivacyChange}
              disabled={privacyLoading}
              className="mt-1"
            />
          </div>
        </div>
      </motion.div>

      {/* Current Status */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="liquid-glass-card p-4 sm:p-6"
      >
        <h4 className="font-medium mb-4 flex items-center gap-2">
          <Users className="w-4 h-4 text-muted-foreground" />
          Current Visibility
        </h4>
        
        <div className={`p-4 rounded-xl border-2 ${isPrivate ? 'border-primary/50 bg-primary/5' : 'border-border bg-muted/20'}`}>
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${isPrivate ? 'bg-primary' : 'bg-green-500'}`} />
            <div>
              <p className="font-medium">
                {isPrivate ? 'Private Account' : 'Public Account'}
              </p>
              <p className="text-sm text-muted-foreground">
                {isPrivate 
                  ? 'Only approved followers can see your posts'
                  : 'Anyone can see your posts and follow you'
                }
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
