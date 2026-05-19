import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  ensureDespiaOneSignalLinked,
  fetchDespiaOneSignalPlayerId,
  resolveCurrentOneSignalExternalId,
} from '@/lib/despiaOneSignal';
import { despiaCall, isDespiaRuntime } from '@/lib/despiaBridge';

const ONESIGNAL_APP_ID = '85bcf4b4-16fb-4101-90b3-59ca9574e57b';

const isDespia = isDespiaRuntime();
type OneSignalSubscription = { id?: string; type?: string; enabled?: boolean };
const PUSH_SUB_TYPES = new Set([
  'iOSPush', 'AndroidPush', 'ChromePush', 'FirefoxPush', 'SafariPush', 'HuaweiPush', 'FireOSPush',
]);
const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
const RELINK_POLL_DELAYS = [0, 1_000, 1_500, 2_000, 2_500, 3_000, 4_000, 5_000, 6_000, 8_000, 10_000, 12_000];

export default function DespiaPushDemo() {
  const [externalId, setExternalId] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [hasEnabledSubscription, setHasEnabledSubscription] = useState(false);
  const [pushEnabled, setPushEnabled] = useState<boolean | null>(null);
  const [title, setTitle] = useState('Hello from VYBE');
  const [message, setMessage] = useState('This is a test push notification.');
  const [sending, setSending] = useState(false);
  const [linking, setLinking] = useState(false);

  const getTargetExternalId = async () => {
    const current = externalId.trim() || (await resolveCurrentOneSignalExternalId()) || '';
    if (current && current !== externalId) setExternalId(current);
    return current;
  };

  // Resolve external_id from Supabase auth (profile.id, matching app push sites).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        let id = data.user?.id || '';
        if (data.user?.id) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .eq('user_id', data.user.id)
            .maybeSingle();
          id = profile?.id || data.user.id;
        }
        if (!id) {
          const k = 'despia.demo.externalId';
          id = localStorage.getItem(k) || `demo_${Math.random().toString(36).slice(2, 10)}`;
          localStorage.setItem(k, id);
        }
        if (!cancelled) setExternalId(id);
      } catch {
        if (!cancelled) setExternalId(`demo_${Math.random().toString(36).slice(2, 10)}`);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Auto-link the device once we know the external_id and verify subscription.
  useEffect(() => {
    if (!isDespia || !externalId) return;
    (async () => {
      const link = await ensureDespiaOneSignalLinked(externalId, { waitForPlayerIdMs: 1_500 });
      setPushEnabled(link.permission);
      const nativeId = link.playerId || await fetchDespiaOneSignalPlayerId(1_500);
      if (nativeId) setPlayerId(nativeId);
      const subs = await fetchEnabledPushSubscriptionIds(externalId);
      setHasEnabledSubscription(subs.length > 0);
    })();
  }, [externalId]);

  // Probe OneSignal Identity API via our edge function to confirm the device
  // is actually subscribed (push token issued + enabled). This is the only
  // reliable signal — Despia's setonesignalplayerid:// is queued and may
  // succeed long before the push subscription record exists.
  const fetchEnabledPushSubscriptionIds = async (extId: string): Promise<string[]> => {
    try {
      const { data, error } = await supabase.functions.invoke('onesignal-user-lookup', {
        body: { app_id: ONESIGNAL_APP_ID, external_id: extId },
      });
      if (error) return [];
      const subs: OneSignalSubscription[] = Array.isArray(data?.subscriptions) ? data.subscriptions : [];
      return subs
        .filter((s) => s?.id && s.enabled !== false && typeof s.type === 'string' && PUSH_SUB_TYPES.has(s.type))
        .map((s) => String(s.id));
    } catch {
      return [];
    }
  };

  const handleRelink = async () => {
    if (!isDespia) {
      toast.error('Open this page inside the Despia app to link push.');
      return;
    }
    const targetExternalId = await getTargetExternalId();
    if (!targetExternalId) {
      toast.error('Sign in first so VYBE can link this device to your account.');
      return;
    }
    setLinking(true);
    try {
      const link = await ensureDespiaOneSignalLinked(targetExternalId, {
        requestPermission: true,
        refreshRegistration: true,
        waitForPlayerIdMs: 2_500,
      });
      if (link.permission !== null) setPushEnabled(link.permission);
      if (link.playerId) setPlayerId(link.playerId);

      // Poll OneSignal's user lookup for an enabled push subscription.
      // OneSignal can take 5-15s on a fresh install to register the device
      // and create the subscription record after the permission prompt.
      let subs: string[] = [];
      for (let i = 0; i < RELINK_POLL_DELAYS.length && subs.length === 0; i += 1) {
        if (RELINK_POLL_DELAYS[i] > 0) await delay(RELINK_POLL_DELAYS[i]);
        if (i === 3 || i === 7) {
          const refreshed = await ensureDespiaOneSignalLinked(targetExternalId, {
            refreshRegistration: true,
            waitForPlayerIdMs: 1_500,
          });
          if (refreshed.permission !== null) setPushEnabled(refreshed.permission);
          if (refreshed.playerId) setPlayerId(refreshed.playerId);
        }
        subs = await fetchEnabledPushSubscriptionIds(targetExternalId);
      }
      setHasEnabledSubscription(subs.length > 0);

      if (subs.length > 0) {
        toast.success('Device linked — push subscription confirmed.');
      } else if (link.permission === false) {
        toast.error('Push permission was not granted. Tap Enable in Settings.');
      } else {
        toast.warning('Permission accepted — still waiting for OneSignal to create the device subscription. Leave this screen open or reopen the app if it stays pending.');
      }
    } catch (e: unknown) {
      toast.error(`Link failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLinking(false);
    }
  };

  const handleOpenSettings = async () => {
    try { await despiaCall('appsettings://'); }
    catch { toast.error('Only works inside the Despia app.'); }
  };

  // Send via our edge function so we use the same path real notifications use
  // (service-role auth, correct subscription lookup, no client-side REST key).
  const handleSend = async () => {
    const target = await getTargetExternalId();
    if (!target) {
      toast.error('No target yet — sign in or tap Re-link.');
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-push-notification', {
        body: {
          userId: target,
          title: title || 'Notification',
          body: message || ' ',
          url: '/notifications',
          type: 'general',
        },
      });
      if (error) {
        toast.error(`Send failed: ${error.message}`);
        return;
      }
      const onesignal = (data as { onesignal?: { ok?: boolean; status?: number; recipients?: number; errors?: unknown } })?.onesignal;
      const sent = (data as { sent?: number })?.sent ?? 0;
      if (onesignal?.ok && (onesignal.recipients ?? 1) > 0) {
        toast.success(`Sent to ${onesignal.recipients ?? '?'} device(s).`);
      } else if (sent > 0) {
        toast.success(`Sent to ${sent} web device(s).`);
      } else if (onesignal?.errors) {
        toast.error(`OneSignal: ${JSON.stringify(onesignal.errors)}`);
      } else {
        toast.warning('No active push subscription. Tap Re-link device and accept the prompt.');
      }
    } catch (e: unknown) {
      toast.error(`Network error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSending(false);
    }
  };

  const copyId = async () => {
    try { await navigator.clipboard.writeText(externalId); toast.success('Copied'); }
    catch { /* clipboard unavailable */ }
  };

  const copyPlayerId = async () => {
    try { await navigator.clipboard.writeText(playerId); toast.success('Copied'); }
    catch { /* clipboard unavailable */ }
  };

  const targetLine = hasEnabledSubscription
    ? `Subscribed ✓ — sending via external_id ${externalId}`
    : (playerId
      ? `Native ID: ${playerId} (no enabled push subscription yet)`
      : (isDespia ? 'Not subscribed yet — tap Re-link device and accept the prompt.' : '—'));

  return (
    <div className="min-h-screen bg-background page-scroll-fix p-4 md:p-8">
      <div className="mx-auto w-full max-w-xl space-y-4">
        <h1 className="text-2xl font-bold">Despia Push Demo</h1>
        <p className="text-sm text-muted-foreground">
          {isDespia
            ? 'Running inside Despia — link this device, then send a test push.'
            : 'Not running inside Despia. Linking and notifications only work inside the native Despia app.'}
        </p>

        <Card className="space-y-3 p-4">
          <label className="text-sm font-medium">Your external_id (OneSignal alias)</label>
          <Textarea
            readOnly
            value={externalId}
            className="font-mono text-xs"
            rows={3}
            onFocus={(e) => e.currentTarget.select()}
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={copyId}>Copy external_id</Button>
            <Button variant="outline" size="sm" onClick={handleRelink} disabled={linking}>
              {linking ? 'Linking…' : 'Re-link device'}
            </Button>
            {pushEnabled === false && (
              <Button variant="outline" size="sm" onClick={handleOpenSettings}>
                Enable in Settings
              </Button>
            )}
          </div>

          <label className="text-sm font-medium pt-2">OneSignal push target</label>
          <Textarea readOnly value={targetLine} className="font-mono text-xs" rows={2} />
          {playerId && (
            <Button variant="secondary" size="sm" onClick={copyPlayerId}>Copy native ID</Button>
          )}

          {pushEnabled !== null && (
            <p className="text-xs text-muted-foreground">
              Push permission: {pushEnabled ? 'granted ✅' : 'not granted ❌'}
            </p>
          )}
        </Card>

        <Card className="space-y-3 p-4">
          <label className="text-sm font-medium">Title</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          <label className="text-sm font-medium">Message</label>
          <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} />
          <Button onClick={handleSend} disabled={sending || !externalId} className="w-full">
            {sending ? 'Sending…' : 'Send test push'}
          </Button>
          <p className="text-[10px] text-muted-foreground">
            Sends via the secure backend (same path real notifications use).
          </p>
        </Card>
      </div>
    </div>
  );
}
