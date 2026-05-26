import { motion } from 'framer-motion';
import { Bell, Megaphone, BellRing, Smartphone, MessageSquare, Phone } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { haptics } from '@/lib/haptics';
import { useNotificationPreferences, useUpdateNotificationPreference } from '@/hooks/useNotificationPreferences';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useQueryClient } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';

export function NotificationsSection() {
  const { profile } = useAuth();
  const { data: prefs } = useNotificationPreferences();
  const updatePref = useUpdateNotificationPreference();
  const queryClient = useQueryClient();
  const { 
    isSupported: pushSupported, 
    isSubscribed: pushSubscribed, 
    isLoading: pushLoading, 
    permission,
    subscribe: subscribePush, 
    unsubscribe: unsubscribePush 
  } = usePushNotifications();

  const handleToggle = async (key: any, value: boolean) => {
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

  const handlePushToggle = async (next: boolean) => {
    haptics.tap();
    if (next) {
      await subscribePush();
    } else {
      await unsubscribePush();
    }
  };

  // Render immediately with defaults from the hook — no blocking skeleton.

  return (
    <div className="space-y-6">
      {/* Push Notifications */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="liquid-glass-card p-4 sm:p-6"
      >
        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Smartphone className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-base mb-1 text-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">Push Notifications</h3>
            <p className="text-sm text-foreground/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
              Get notified about calls and messages even when the app is closed
            </p>
          </div>
        </div>

        {pushSupported ? (
          <div className="space-y-4">
            {/* Push toggle */}
            <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-background flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bell className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium">Enable Push Notifications</p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Receive DM and call notifications on this device
                    </p>
                  </div>
                </div>
                <Switch 
                  checked={pushSubscribed} 
                  onCheckedChange={handlePushToggle}
                  disabled={pushLoading}
                  className="mt-1"
                />
              </div>
              {pushSubscribed && profile?.id && (
                <div className="mt-3 pt-3 border-t border-border/40">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={async () => {
                      haptics.tap();
                      try {
                        const { error } = await supabase.functions.invoke('send-push-notification', {
                          body: {
                            userId: profile.id,
                            title: 'VYBE test push 🚀',
                            body: 'If you see this, push is working on this device.',
                            tag: 'test-push',
                          },
                        });
                        if (error) throw error;
                        toast.success('Test push sent — check your lock screen!');
                      } catch (e: any) {
                        toast.error(e?.message || 'Could not send test push');
                      }
                    }}
                  >
                    Send me a test push
                  </Button>
                  <p className="text-[11px] text-muted-foreground/80 mt-2">
                    If you don't get one within ~10 seconds, push isn't wired to this device yet —
                    turn the toggle off and back on, or reinstall the app.
                  </p>
                </div>
              )}
            </div>

            {/* What you'll receive */}
            {pushSubscribed && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="space-y-2 pl-4 border-l-2 border-primary/30"
              >
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MessageSquare className="w-4 h-4" />
                  <span>New messages and group chats</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Phone className="w-4 h-4" />
                  <span>Incoming audio and video calls</span>
                </div>
              </motion.div>
            )}

            {/* Permission denied warning */}
            {permission === 'denied' && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                Notifications are blocked. Please enable them in your browser settings.
              </div>
            )}
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
            <p className="text-sm text-muted-foreground">
              Push notifications are not supported on this browser. Try using Chrome, Firefox, or Safari.
            </p>
          </div>
        )}
      </motion.div>

      {/* In-App Notifications */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="liquid-glass-card p-4 sm:p-6"
      >
        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <BellRing className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-base mb-1">In-App Notifications</h3>
            <p className="text-sm text-muted-foreground">
              Choose what notifications you want to receive while using the app
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

      {/* Smart Pings */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="liquid-glass-card p-4 sm:p-6"
      >
        <div className="flex items-start gap-4 mb-4">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <BellRing className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-base mb-1">Smart Pings ✨</h3>
            <p className="text-sm text-muted-foreground">
              Clean, contextual alerts about what's happening near you and from your Daily Brief. Capped daily so it never feels spammy.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {[
            { key: 'nearby_enabled', label: '📍 Happenings near you', desc: 'Posts and moments within your radius' },
            { key: 'friend_activity_enabled', label: '👀 Friend activity', desc: 'When friends post or go live nearby' },
            { key: 'trending_local_enabled', label: '🔥 Trending locally', desc: "What's blowing up around you" },
            { key: 'brief_pings_enabled', label: '🧠 Daily Brief stories', desc: 'Top story alerts based on your interests' },
          ].map(({ key, label, desc }) => (
            <div key={key} className="p-3 rounded-xl bg-muted/30 border border-border/50 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-sm">{label}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
              <Switch
                checked={(prefs as any)?.[key] ?? true}
                onCheckedChange={(v) => handleToggle(key, v)}
              />
            </div>
          ))}
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
        
        <div className="space-y-3">
          {/* Push status */}
          <div className={`p-4 rounded-xl border-2 ${pushSubscribed ? 'border-green-500/50 bg-green-500/5' : 'border-border bg-muted/20'}`}>
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${pushSubscribed ? 'bg-green-500' : 'bg-muted-foreground'}`} />
              <div>
                <p className="font-medium">
                  Push: {pushSubscribed ? 'Enabled' : 'Disabled'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {pushSubscribed 
                    ? 'You\'ll receive notifications even when the app is closed'
                    : 'Enable push to get notifications when away'
                  }
                </p>
              </div>
            </div>
          </div>

          {/* In-app status */}
          <div className={`p-4 rounded-xl border-2 ${prefs?.announcements_enabled ? 'border-green-500/50 bg-green-500/5' : 'border-border bg-muted/20'}`}>
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${prefs?.announcements_enabled ? 'bg-green-500' : 'bg-muted-foreground'}`} />
              <div>
                <p className="font-medium">
                  Announcements: {prefs?.announcements_enabled ? 'Enabled' : 'Disabled'}
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
        </div>
      </motion.div>
    </div>
  );
}
