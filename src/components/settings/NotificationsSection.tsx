import { useEffect, useMemo, useRef } from 'react';
import { Bell, Megaphone, BellRing, Smartphone, MessageSquare, Phone, Sparkles, Eye, Heart, MessageCircle, UserPlus, Users } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { fireDespiaTestPushInstant } from '@/lib/despiaOneSignal';
import { isDespiaRuntime } from '@/lib/despiaBridge';
import { pushNotLinkedHint } from '@/lib/pushSettingsCopy';
import { parseEdgeInvokeResult, pushDeliveryErrorMessage } from '@/lib/edgeFunctionResponse';
import { haptics } from '@/lib/haptics';
import { useNotificationPreferences, useUpdateNotificationPreference } from '@/hooks/useNotificationPreferences';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { tokenAccountGuard } from '@/lib/tokenMarketplaceService';
import type { NotificationBooleanKey } from '@/lib/notificationPreferenceService';
import {
  SettingsSectionCard,
  SettingsPanel,
  SettingsToggleRow,
  SettingsStatusCard,
} from './SettingsUI';

export function NotificationsSection() {
  const { user, profile } = useAuth();
  const preferenceQuery = useNotificationPreferences();
  const { data: prefs, revision } = preferenceQuery;
  const updatePref = useUpdateNotificationPreference();
  const context = useMemo(() => ({ active: true }), [user?.id, profile?.id]);
  const contextRef = useRef(context); contextRef.current = context;
  useEffect(() => { context.active = true; return () => { context.active = false; }; }, [context]);
  const {
    isSupported: pushSupported,
    isSubscribed: pushSubscribed,
    isLoading: pushLoading,
    permission,
    subscribe: subscribePush,
    unsubscribe: unsubscribePush,
  } = usePushNotifications();

  const handleToggle = async (key: string, value: boolean) => {
    if (!prefs || !revision || updatePref.isPending) return;
    const accountGuard = tokenAccountGuard(user?.id);
    const current = () => {
      try { accountGuard(); return context.active && contextRef.current === context; } catch { return false; }
    };
    try {
      haptics.tap();
      const saved = await updatePref.mutateAsync({ key: key as NotificationBooleanKey, value, revision });
      if (!current()) return;
      if (saved.preferences[key as NotificationBooleanKey] !== value) {
        toast.info('A newer choice is already saved. Your settings have been refreshed.');
      } else toast.success('Notification preference saved');
    } catch (error) {
      if (!current()) return;
      toast.error(error instanceof Error ? error.message : 'Could not save this preference. Please retry.');
      if (error && typeof error === 'object' && 'code' in error && error.code === 'aborted') void preferenceQuery.refetch();
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
                    onClick={() => {
                      haptics.tap();
                      if (isDespiaRuntime() && profile?.id) {
                        const sent = fireDespiaTestPushInstant(profile.id);
                        if (sent) toast.info('Test push requested. Check your device for the notification.');
                        else toast.error('Could not request a test push on this device.');
                        return;
                      }

                      void (async () => {
                      try {
                        const result = await db.functions.invoke('send-push-notification', {
                          body: {
                            userId: profile.id,
                            title: 'VYBE test push 🚀',
                            body: 'If you see this, push is working on this device.',
                            tag: 'test-push',
                            type: 'announcement',
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
                        if (result.error && !payload?.success && !(payload?.ok === true && (payload?.sent as number) > 0)) {
                          throw new Error(errorMessage || result.error.message);
                        }
                        toast.success('Test push accepted by the delivery service. Check your device.');
                      } catch (e: unknown) {
                        const msg = e instanceof Error ? e.message : 'Could not send test push';
                        toast.error(msg);
                      }
                      })();
                    }}
                  >
                    Send me a test push
                  </Button>
                  <p className="text-[11px] text-muted-foreground/80 mt-2 leading-relaxed">
                    On the Despia app you should see it right away. If nothing appears, turn push off and back on.
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

      {!prefs ? (
        <SettingsSectionCard icon={BellRing} title="Notification preferences">
          <p role={preferenceQuery.isError ? 'alert' : 'status'} className="text-sm text-muted-foreground">
            {preferenceQuery.isError ? 'Could not load your saved notification preferences.' : 'Loading your notification preferences…'}
          </p>
          {preferenceQuery.isError && <Button className="mt-3 rounded-full" variant="outline" onClick={() => void preferenceQuery.refetch()}>Retry notification preferences</Button>}
        </SettingsSectionCard>
      ) : <>
      <SettingsSectionCard
        icon={BellRing}
        title="Push alert preferences"
        description="Choose which push alerts you receive. Existing notifications stay in your inbox."
        delay={0.05}
      >
        <SettingsPanel className="space-y-0">
          <SettingsToggleRow
            icon={Eye}
            title="Show message preview"
            description="When off, push shows generic New Chat / New Snap (Snapchat-style privacy)"
            checked={prefs?.show_message_preview ?? true}
            onCheckedChange={(checked) => handleToggle('show_message_preview', checked)}
            disabled={updatePref.isPending}
          />
          <SettingsToggleRow
            icon={MessageSquare}
            title="Messages"
            description="Direct messages and group chats"
            checked={prefs?.dms_enabled ?? true}
            onCheckedChange={(checked) => handleToggle('dms_enabled', checked)}
            disabled={updatePref.isPending}
          />
          <SettingsToggleRow
            icon={Phone}
            title="Calls"
            description="Incoming audio and video calls (can break through quiet hours)"
            checked={prefs?.calls_enabled ?? true}
            onCheckedChange={(checked) => handleToggle('calls_enabled', checked)}
            disabled={updatePref.isPending}
          />
          <SettingsToggleRow
            icon={UserPlus}
            title="Friend requests"
            description="When someone wants to connect"
            checked={prefs?.friend_requests_enabled ?? true}
            onCheckedChange={(checked) => handleToggle('friend_requests_enabled', checked)}
            disabled={updatePref.isPending}
          />
          <SettingsToggleRow
            icon={Sparkles}
            title="Stories"
            description="Story push alerts are not available yet. Your saved choice is retained."
            checked={prefs?.stories_enabled ?? true}
            onCheckedChange={(checked) => handleToggle('stories_enabled', checked)}
            disabled
          />
          <SettingsToggleRow
            icon={Heart}
            title="Likes"
            description="When someone likes your post"
            checked={prefs?.likes_enabled ?? true}
            onCheckedChange={(checked) => handleToggle('likes_enabled', checked)}
            disabled={updatePref.isPending}
          />
          <SettingsToggleRow
            icon={MessageCircle}
            title="Comments"
            description="Comments and replies on your posts"
            checked={prefs?.comments_enabled ?? true}
            onCheckedChange={(checked) => handleToggle('comments_enabled', checked)}
            disabled={updatePref.isPending}
          />
          <SettingsToggleRow
            icon={Users}
            title="Follows"
            description="When someone follows you"
            checked={prefs?.follows_enabled ?? true}
            onCheckedChange={(checked) => handleToggle('follows_enabled', checked)}
            disabled={updatePref.isPending}
          />
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
        description="Choose alerts from your Daily Brief and map activity."
        delay={0.08}
      >
        <SettingsPanel className="space-y-0">
          {[
            { key: 'nearby_enabled', label: 'Map activity', desc: 'Map waves and meetup invitations' },
            { key: 'friend_activity_enabled', label: 'Friend activity', desc: 'Push alerts are not available yet. Your saved choice is retained.', unavailable: true },
            { key: 'trending_local_enabled', label: 'Trending locally', desc: 'Push alerts are not available yet. Your saved choice is retained.', unavailable: true },
            { key: 'brief_pings_enabled', label: 'Daily Brief stories', desc: 'Top story alerts based on your interests' },
          ].map(({ key, label, desc, unavailable }) => (
            <SettingsToggleRow
              key={key}
              title={label}
              description={desc}
              checked={(prefs as unknown as Record<string, boolean | undefined>)?.[key] ?? true}
              onCheckedChange={(v) => handleToggle(key, v)}
              disabled={updatePref.isPending || unavailable}
            />
          ))}
        </SettingsPanel>
      </SettingsSectionCard>
      </>}

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
            title={`Announcements: ${!prefs ? 'Not loaded' : prefs.announcements_enabled ? 'Enabled' : 'Disabled'}`}
            description={
              !prefs ? 'Load your saved preferences to view this setting.' : prefs.announcements_enabled
                ? 'You will receive important updates'
                : 'You may miss important announcements'
            }
          />
        </div>
      </SettingsSectionCard>
    </div>
  );
}
