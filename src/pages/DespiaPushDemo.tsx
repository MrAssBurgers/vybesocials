import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

const ONESIGNAL_APP_ID = '85bcf4b4-16fb-4101-90b3-59ca9574e57b';
// NOTE: client-side key for demo purposes only — never ship a real REST API key in production.
const ONESIGNAL_REST_KEY =
  'os_v2_app_qw6pjnaw7naqdeftlhfjk5hfpp7ffcc24keu5mvni4pb3ro253k6c6usokshxlvabzdbe3v63ntvr3szbivddsbfb3r36rftn3vwmvq';

const isDespia =
  typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('despia');

export default function DespiaPushDemo() {
  const [externalId, setExternalId] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [pushEnabled, setPushEnabled] = useState<boolean | null>(null);
  const [title, setTitle] = useState('Hello from VYBE');
  const [message, setMessage] = useState('This is a test push notification.');
  const [sending, setSending] = useState(false);
  const [linking, setLinking] = useState(false);

  // Resolve the external user id from Supabase auth, fallback to a generated demo id.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const id =
          data.user?.id ||
          (() => {
            const k = 'despia.demo.externalId';
            let v = localStorage.getItem(k);
            if (!v) {
              v = `demo_${Math.random().toString(36).slice(2, 10)}`;
              localStorage.setItem(k, v);
            }
            return v;
          })();
        if (!cancelled) setExternalId(id);
      } catch {
        if (!cancelled) setExternalId(`demo_${Math.random().toString(36).slice(2, 10)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const callDespia = async (scheme: string, returnKeys: string[] = []) => {
    const mod: any = await import('despia-native').catch(() => null);
    const despia = mod?.default || (window as any).despia;
    if (!despia) throw new Error('despia-native not available');
    return returnKeys.length ? despia(scheme, returnKeys) : despia(scheme);
  };

  const fetchPlayerId = async () => {
    // Try a few known Despia scheme variants to retrieve the OneSignal player/subscription id.
    const attempts: Array<[string, string[]]> = [
      ['getonesignalplayerid://', ['playerId', 'onesignal_player_id', 'player_id']],
      ['onesignalplayerid://', ['playerId', 'player_id']],
    ];
    for (const [scheme, keys] of attempts) {
      try {
        const res: any = await callDespia(scheme, keys);
        const id =
          res?.playerId || res?.player_id || res?.onesignal_player_id || res?.[keys[0]];
        if (id && typeof id === 'string') return id;
      } catch {
        // try next
      }
    }
    return '';
  };

  // Link external_id to the device + fetch player id.
  useEffect(() => {
    if (!isDespia || !externalId) return;
    (async () => {
      try {
        await callDespia(`setonesignalplayerid://?user_id=${encodeURIComponent(externalId)}`);
      } catch (e) {
        console.warn('[DespiaPushDemo] link failed:', e);
      }
      try {
        const res: any = await callDespia('checkNativePushPermissions://', ['nativePushEnabled']);
        setPushEnabled(!!res?.nativePushEnabled);
      } catch {
        setPushEnabled(null);
      }
      const pid = await fetchPlayerId();
      if (pid) setPlayerId(pid);
    })();
  }, [externalId]);

  const handleRelink = async () => {
    if (!isDespia) {
      toast.error('Open this page inside the Despia app to link push.');
      return;
    }
    setLinking(true);
    try {
      await callDespia(`setonesignalplayerid://?user_id=${encodeURIComponent(externalId)}`);
      const pid = await fetchPlayerId();
      if (pid) setPlayerId(pid);
      toast.success('Device linked');
    } catch (e: any) {
      toast.error(`Link failed: ${e?.message || e}`);
    } finally {
      setLinking(false);
    }
  };

  const handleOpenSettings = async () => {
    try {
      await callDespia('settingsapp://');
    } catch {
      toast.error('Only works inside the Despia app.');
    }
  };

  // Look up subscription IDs for an external_id via OneSignal's User Identity API.
  // This is the reliable way to send when we don't have a player_id cached client-side.
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
      const subs: any[] = data?.subscriptions || [];
      // Only push subscriptions that are enabled.
      return subs
        .filter((s) => (s.type === 'iOSPush' || s.type === 'AndroidPush' || s.type === 'ChromePush' || s.type === 'FirefoxPush' || s.type === 'SafariPush' || s.type === 'HuaweiPush') && s.enabled !== false && s.id)
        .map((s) => s.id as string);
    } catch (e) {
      console.warn('[OneSignal] user lookup error', e);
      return [];
    }
  };

  const handleSend = async () => {
    if (!externalId && !playerId) {
      toast.error('No target yet.');
      return;
    }
    setSending(true);
    try {
      const body: Record<string, any> = {
        app_id: ONESIGNAL_APP_ID,
        target_channel: 'push',
        headings: { en: title || 'Notification' },
        contents: { en: message || ' ' },
      };

      // Resolve a concrete subscription target. Order of preference:
      //  1. Cached player_id from the Despia bridge.
      //  2. Subscription IDs looked up from OneSignal via external_id.
      // We never send with include_aliases/external_id alone because OneSignal
      // rejects it with "invalid_aliases" when the alias isn't registered yet.
      let subscriptionIds: string[] = [];
      if (playerId) {
        subscriptionIds = [playerId];
      } else if (externalId) {
        subscriptionIds = await resolveSubscriptionIds(externalId);
        // Cache the first one for next time.
        if (subscriptionIds[0]) setPlayerId(subscriptionIds[0]);
      }

      if (subscriptionIds.length === 0) {
        toast.error(
          'No push subscription found for this user. Open the app in Despia, allow notifications, then tap "Re-link device".',
        );
        setSending(false);
        return;
      }

      body.include_subscription_ids = subscriptionIds;

      const res = await fetch('https://onesignal.com/api/v1/notifications', {
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
    } catch (e: any) {
      toast.error(`Network error: ${e?.message || e}`);
    } finally {
      setSending(false);
    }
  };

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(externalId);
      toast.success('Copied');
    } catch {}
  };

  const copyPlayerId = async () => {
    try {
      await navigator.clipboard.writeText(playerId);
      toast.success('Copied');
    } catch {}
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

          <label className="text-sm font-medium pt-2">OneSignal player_id (subscription)</label>
          <Textarea
            readOnly
            value={playerId || (isDespia ? 'Not available yet — tap Re-link device.' : '—')}
            className="font-mono text-xs"
            rows={2}
            onFocus={(e) => e.currentTarget.select()}
          />
          {playerId && (
            <Button variant="secondary" size="sm" onClick={copyPlayerId}>
              Copy player_id
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
