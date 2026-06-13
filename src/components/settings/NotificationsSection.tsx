import { Bell, Megaphone, BellRing, Smartphone, MessageSquare, Phone, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { ensureDespiaOneSignalLinked, linkOneSignalUser } from '@/lib/despiaOneSignal';
import { isDespiaRuntime, openAppSettings } from '@/lib/despiaBridge';
import { pushBlockedSettingsMessage, pushNotLinkedHint } from '@/lib/pushSettingsCopy';
import { parseEdgeInvokeResult, pushDeliveryErrorMessage } from '@/lib/edgeFunctionResponse';
import { haptics } from '@/lib/haptics';
import { useNotificationPreferences, useUpdateNotificationPreference } from '@/hooks/useNotificationPreferences';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useQueryClient } from '@tanstack/react-query';
import {
  SettingsSectionCard,
  SettingsPanel,
  SettingsToggleRow,
  SettingsStatusCard,
} from './SettingsUI';

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
    unsubscribe: unsubscribePush,
  } = usePushNotifications();

  const handleToggle = async (key: string, value: boolean) => {
    haptics.tap();
    updatePref.mutate({ key: key as never, value });

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

  return (
    <div className="space-y-6">
      <SettingsSectionCard
        icon={Smartphone}
        title="Push Notifications"
        description="Get notified about calls and messages even when the app is closed"
      >
        {pushSupported ? (
          <div className="space-y-4">
            <SettingsPanel>
              <SettingsToggleRow
                icon={Bell}
                title="Enable Push Notifications"
                description="Receive DM and call notifications on this device"
                checked={pushSubscribed}
                onCheckedChange={handlePushToggle}
                disabled={pushLoading}
              />
              {pushSubscribed && profile?.id && (
                <div className="mt-3 pt-3 border-t border-foreground/[0.06]">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={async () => {
                      haptics.tap();
                      try {
                        if (isDespiaRuntime()) {
                          toast.message('Linking this device to push…');
                          const link = await ensureDespiaOneSignalLinked(profile.id, {
                            requestPermission: true,
                            waitForPlayerIdMs: 12_000,
                            persistToken: true,
                            trigger: 'test-push',
                          });
                          if (link.permission === false) {
                            toast.error(pushBlockedSettingsMessage(), {
                              action: isDespiaRuntime() ? {
                                label: 'Open settings',
                                onClick: () => { void openAppSettings(); },
                              } : undefined,
                            });
                            return;
                          }
                          if (link.playerId) {
                            await linkOneSignalUser(profile.id, link.playerId);
                          } else {
                            await linkOneSignalUser(profile.id);
                            toast.message('Still linking device… wait a few seconds and try again.');
                            return;
                          }
                        } else {
                          await linkOneSignalUser(profile.id);
                        }

                        const result = await supabase.functions.invoke('send-push-notification', {
                          body: {
                            userId: profile.id,
                            title: 'VYBE test push 🚀',
                            body: 'If you see this, push is working on this device.',
                            tag: 'test-push',
                          },
                        });
                        const { payload, errorMessage } = await parseEdgeInvokeResult(result);
                        const deliveryError = pushDeliveryErrorMessage(payload);
                        if (deliveryError) {
                          toast.error(deliveryError, {
                            description: deliveryError.includes('not linked') ? pushNotLinkedHint() : undefined,
                          });
                          return;
                        }
                        if (result.error && !payload?.success) {
                          throw new Error(errorMessage || result.error.message);
                        }
                        toast.success('Test push sent — check your lock screen!');
                      } catch (e: unknown) {
                        const msg = e instanceof Error ? e.message : 'Could not send test push';
                        toast.error(msg);
                      }
                    }}
                  >
                    Send me a test push
                  </Button>
                  <p className="text-[11px] text-muted-foreground/80 mt-2 leading-relaxed">
                    If you don't get one within ~10 seconds, push isn't wired to this device yet —
                    turn the toggle off and back on, or reinstall the app.
                  </p>
                </div>
              )}
            </SettingsPanel>

            {pushSubscribed && (
              <div className="space-y-2 pl-4 border-l-2 border-primary/30">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MessageSquare className="w-4 h-4 shrink-0" />
                  <span>New messages and group chats</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Phone className="w-4 h-4 shrink-0" />
                  <span>Incoming audio and video calls</span>
                </div>
              </div>
            )}

            {permission === 'denied' && (
              <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                Notifications are blocked. Please enable them in your browser settings.
              </div>
            )}
          </div>
        ) : (
          <SettingsPanel>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Push notifications are not supported on this browser. Try using Chrome, Firefox, or Safari.
            </p>
          </SettingsPanel>
        )}
      </SettingsSectionCard>

      <SettingsSectionCard
        icon={BellRing}
        title="In-App Notifications"
        description="Choose what notifications you want to receive while using the app"
        delay={0.05}
      >
        <SettingsPanel>
          <SettingsToggleRow
            icon={Megaphone}
            title="Announcements"
            description="Receive app announcements and important updates"
            checked={prefs?.announcements_enabled ?? true}
            onCheckedChange={(checked) => handleToggle('announcements_enabled', checked)}
            disabled={updatePref.isPending}
          />
        </SettingsPanel>
      </SettingsSectionCard>

      <SettingsSectionCard
        icon={Sparkles}
        iconClassName="from-violet-500/20 to-primary/10 ring-violet-500/25"
        title="Smart Pings"
        description="Clean, contextual alerts from your Daily Brief and nearby activity. Capped daily so it never feels spammy."
        delay={0.08}
      >
        <SettingsPanel className="space-y-0">
          {[
            { key: 'nearby_enabled', label: 'Happenings near you', desc: 'Posts and moments within your radius' },
            { key: 'friend_activity_enabled', label: 'Friend activity', desc: 'When friends post or go live nearby' },
            { key: 'trending_local_enabled', label: 'Trending locally', desc: "What's blowing up around you" },
            { key: 'brief_pings_enabled', label: 'Daily Brief stories', desc: 'Top story alerts based on your interests' },
          ].map(({ key, label, desc }) => (
            <SettingsToggleRow
              key={key}
              title={label}
              description={desc}
              checked={(prefs as unknown as Record<string, boolean | undefined>)?.[key] ?? true}
              onCheckedChange={(v) => handleToggle(key, v)}
            />
          ))}
        </SettingsPanel>
      </SettingsSectionCard>

      <SettingsSectionCard icon={Bell} title="Notification Status" delay={0.1}>
        <div className="space-y-3">
          <SettingsStatusCard
            active={pushSubscribed}
            title={`Push: ${pushSubscribed ? 'Enabled' : 'Disabled'}`}
            description={
              pushSubscribed
                ? "You'll receive notifications even when the app is closed"
                : 'Enable push to get notifications when away'
            }
          />
          <SettingsStatusCard
            active={!!prefs?.announcements_enabled}
            title={`Announcements: ${prefs?.announcements_enabled ? 'Enabled' : 'Disabled'}`}
            description={
              prefs?.announcements_enabled
                ? 'You will receive important updates'
                : 'You may miss important announcements'
            }
          />
        </div>
      </SettingsSectionCard>
    </div>
  );
}
