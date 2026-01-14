import { motion } from 'framer-motion';
import { Bell } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { haptics } from '@/lib/haptics';
import { useNotificationPreferences, useUpdateNotificationPreference } from '@/hooks/useNotificationPreferences';
import { useQueryClient } from '@tanstack/react-query';

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

  if (isLoading || !prefs) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="liquid-glass-card p-4 sm:p-6"
      >
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-muted rounded w-32" />
          <div className="h-12 bg-muted rounded" />
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="liquid-glass-card p-4 sm:p-6"
    >
      <h3 className="font-semibold mb-4 flex items-center gap-2 text-sm sm:text-base">
        <Bell className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
        Notifications
      </h3>

      <div className="flex items-center justify-between py-3">
        <div className="min-w-0 flex-1 mr-4">
          <p className="font-medium text-sm sm:text-base">Announcements</p>
          <p className="text-xs sm:text-sm text-muted-foreground">Receive app announcements and updates</p>
        </div>
        <Switch 
          checked={prefs.announcements_enabled ?? true} 
          onCheckedChange={(checked) => handleToggle('announcements_enabled', checked)}
          disabled={updatePref.isPending}
        />
      </div>
    </motion.div>
  );
}
