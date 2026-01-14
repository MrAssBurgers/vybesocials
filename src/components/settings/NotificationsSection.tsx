import { motion } from 'framer-motion';
import { Bell, Megaphone, BellRing } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { haptics } from '@/lib/haptics';
import { useNotificationPreferences, useUpdateNotificationPreference } from '@/hooks/useNotificationPreferences';
import { useQueryClient } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';

export function NotificationsSection() {
  const { profile } = useAuth();
  const { data: prefs, isLoading } = useNotificationPreferences();
  const updatePref = useUpdateNotificationPreference();
  const queryClient = useQueryClient();

  const handleToggle = async (key: 'announcements_enabled', value: boolean) => {
    haptics.tap();
    updatePref.mutate({ key, value });
    
    if (!value && key === 'announcements_enabled' && profile?.id) {
      await supabase
        .from('notifications')
        .delete()
        .eq('user_id', profile.id)
        .eq('type', 'announcement')
        .eq('read', false);
      
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unread-notifications'] });
      toast.success('Announcement notifications cleared');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="liquid-glass-card p-4 sm:p-6">
          <div className="flex items-start gap-4 mb-6">
            <Skeleton className="w-12 h-12 rounded-xl" />
            <div className="flex-1">
              <Skeleton className="h-5 w-40 mb-2" />
              <Skeleton className="h-4 w-64" />
            </div>
          </div>
          <Skeleton className="h-20 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="liquid-glass-card p-4 sm:p-6"
      >
        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <BellRing className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-base mb-1">Notification Preferences</h3>
            <p className="text-sm text-muted-foreground">
              Choose what notifications you want to receive
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Announcements */}
          <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-background flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Megaphone className="w-5 h-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium">Announcements</p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Receive app announcements and important updates
                  </p>
                </div>
              </div>
              <Switch 
                checked={prefs?.announcements_enabled ?? true} 
                onCheckedChange={(checked) => handleToggle('announcements_enabled', checked)}
                disabled={updatePref.isPending}
                className="mt-1"
              />
            </div>
          </div>
        </div>
      </motion.div>

      {/* Status Card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="liquid-glass-card p-4 sm:p-6"
      >
        <h4 className="font-medium mb-4 flex items-center gap-2">
          <Bell className="w-4 h-4 text-muted-foreground" />
          Notification Status
        </h4>
        
        <div className={`p-4 rounded-xl border-2 ${prefs?.announcements_enabled ? 'border-green-500/50 bg-green-500/5' : 'border-border bg-muted/20'}`}>
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${prefs?.announcements_enabled ? 'bg-green-500' : 'bg-muted-foreground'}`} />
            <div>
              <p className="font-medium">
                {prefs?.announcements_enabled ? 'Notifications Enabled' : 'Notifications Disabled'}
              </p>
              <p className="text-sm text-muted-foreground">
                {prefs?.announcements_enabled 
                  ? 'You will receive important updates'
                  : 'You may miss important announcements'
                }
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
