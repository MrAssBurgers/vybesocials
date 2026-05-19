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
// NOTE: client-side key for demo purposes only — never ship a real REST API key in production.
const ONESIGNAL_REST_KEY =
  'os_v2_app_qw6pjnaw7naqdeftlhfjk5hfpp7ffcc24keu5mvni4pb3ro253k6c6usokshxlvabzdbe3v63ntvr3szbivddsbfb3r36rftn3vwmvq';

const isDespia = isDespiaRuntime();
type OneSignalSubscription = { id?: string; type?: string; enabled?: boolean };
const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export default function DespiaPushDemo() {
  const [externalId, setExternalId] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [linkedByDevice, setLinkedByDevice] = useState(false);
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

  // Resolve the external user id from Supabase auth, fallback to a generated demo id.
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
    return () => {
      cancelled = true;
    };
  }, []);

  // Link external_id to the device + fetch player id.
  useEffect(() => {
    if (!isDespia || !externalId) return;
    (async () => {
      const link = await ensureDespiaOneSignalLinked(externalId, { waitForPlayerIdMs: 1_500 });
      if (link.linked) setLinkedByDevice(true);
      setPushEnabled(link.permission);
      let pid = link.playerId || await fetchDespiaOneSignalPlayerId(1_500);
      if (!pid) pid = (await resolveSubscriptionIds(externalId))[0] || '';
      if (pid) setPlayerId(pid);
    })();
  }, [externalId]);

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
        waitForPlayerIdMs: 2_500,
      });
      if (link.linked) setLinkedByDevice(true);
      if (link.permission !== null) setPushEnabled(link.permission);
      const pid = await resolveLinkedPlayerId(targetExternalId, link.playerId);
      if (pid) setPlayerId(pid);
      toast.success(pid ? 'Device linked — subscribed push target found.' : 'Device linked — waiting for notification permission to finish.');
    } catch (e: unknown) {
      toast.error(`Link failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLinking(false);
    }
  };

  const handleOpenSettings = async () => {
    try {
      await despiaCall('appsettings://');
    } catch {
      toast.error('Only works inside the Despia app.');
    }
  };

  // Look up subscription IDs for an external_id via OneSignal's User Identity API.
  // Only return subscriptions OneSignal says are actively subscribed; raw native
  // player IDs can point at unsubscribed records and fail sends.
  const resolveSubscriptionIds = async (extId: string): Promise<string[]> => {
    try {
      const url = `https://api.onesignal.com/apps/${ONESIGNAL_APP_ID}/users/by/external_id/${encodeURIComponent(extId)}`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Key ${ONESIGNAL_REST_KEY}`,
          Accept: 'application/json',
        },
      });
      if (!res.ok) {
        console.warn('[OneSignal] user lookup failed', res.status, await res.text().catch(() => ''));
        return [];
      }
      const data = await res.json();
      const subs: OneSignalSubscription[] = Array.isArray(data?.subscriptions) ? data.subscriptions : [];
      // Only push subscriptions that are enabled and currently subscribed.
      return subs
        .filter((s) => (s.type === 'iOSPush' || s.type === 'AndroidPush' || s.type === 'ChromePush' || s.type === 'FirefoxPush' || s.type === 'SafariPush' || s.type === 'HuaweiPush') && s.enabled === true && s.id)
        .map((s) => s.id as string);
    } catch (e) {
      console.warn('[OneSignal] user lookup error', e);
      return [];
    }
  };

  const resolveLinkedPlayerId = async (targetExternalId: string, initialId = ''): Promise<string> => {
    if (initialId) return initialId;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const nativeId = await fetchDespiaOneSignalPlayerId(attempt === 0 ? 800 : 400);
      if (nativeId) return nativeId;
      const lookedUpId = (await resolveSubscriptionIds(targetExternalId))[0] || '';
      if (lookedUpId) return lookedUpId;
      await delay(650);
      void ensureDespiaOneSignalLinked(targetExternalId, { waitForPlayerIdMs: 0, persistToken: false });
    }
    return '';
  };

  const handleSend = async () => {
    if (!externalId && !playerId) {
      toast.error('No target yet.');
      return;
    }
    setSending(true);
    try {
      const body: Record<string, unknown> = {
        app_id: ONESIGNAL_APP_ID,
        target_channel: 'push',
        headings: { en: title || 'Notification' },
        contents: { en: message || ' ' },
      };

      // Always verify against OneSignal before sending. The Despia bridge can
      // expose a player id before the device is actually subscribed, and sending
      // that raw id is what caused "All included players are not subscribed".
      let subscriptionIds = externalId ? await resolveSubscriptionIds(externalId) : [];
      if (!subscriptionIds.length && playerId) {
        const relinked = await ensureDespiaOneSignalLinked(externalId, {
          requestPermission: true,
          waitForPlayerIdMs: 2_000,
          persistToken: false,
        });
        if (relinked.permission !== null) setPushEnabled(relinked.permission);
        subscriptionIds = externalId ? await resolveSubscriptionIds(externalId) : [];
      }
      if (subscriptionIds[0]) setPlayerId(subscriptionIds[0]);

      if (!subscriptionIds.length) {
        toast.error('No subscribed push device found yet — allow notifications, reopen VYBE, then tap Re-link device.');
        return;
      }

      body.include_subscription_ids = subscriptionIds;

      const res = await fetch('https://api.onesignal.com/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Key ${ONESIGNAL_REST_KEY}`,
        },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || json?.errors) {
        console.error('OneSignal error:', json);
        toast.error(`Send failed: ${JSON.stringify(json?.errors || json)}`);
      } else if (json?.recipients === 0) {
        toast.warning('Sent, but no recipients matched.');
      } else {
        toast.success(`Sent to ${json?.recipients ?? '?'} device(s).`);
      }
    } catch (e: unknown) {
      toast.error(`Network error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSending(false);
    }
  };

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(externalId);
      toast.success('Copied');
    } catch { /* clipboard unavailable */ }
  };

  const copyPlayerId = async () => {
    try {
      await navigator.clipboard.writeText(playerId);
      toast.success('Copied');
    } catch { /* clipboard unavailable */ }
  };

  return (
    <div className="min-h-screen bg-background page-scroll-fix p-4 md:p-8">
      <div className="mx-auto w-full max-w-xl space-y-4">
        <h1 className="text-2xl font-bold">Despia Push Demo</h1>
        <p className="text-sm text-muted-foreground">
          {isDespia
            ? 'Running inside Despia — your external_id is linked to this device.'
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
            <Button variant="secondary" size="sm" onClick={copyId}>
              Copy external_id
            </Button>
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
          <Textarea
            readOnly
            value={playerId || (linkedByDevice ? `Linked by device — using external_id ${externalId}` : (isDespia ? 'Not linked yet — tap Re-link device.' : '—'))}
            className="font-mono text-xs"
            rows={2}
            onFocus={(e) => e.currentTarget.select()}
          />
          {playerId && (
            <Button variant="secondary" size="sm" onClick={copyPlayerId}>
              Copy push target
            </Button>
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
          <Button onClick={handleSend} disabled={sending || (!externalId && !playerId)} className="w-full">
            {sending ? 'Sending…' : `Send via ${playerId ? 'player_id' : 'external_id'}`}
          </Button>
          <p className="text-[10px] text-muted-foreground">
            Demo only — calls OneSignal REST API directly from the browser. Move to an edge function before shipping.
          </p>
        </Card>
      </div>
    </div>
  );
}
