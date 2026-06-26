import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import {
  ensureDespiaOneSignalLinked,
  fetchPushSubscriptionStatus,
  resolveCurrentOneSignalExternalId,
  resolveLinkedSubscriptionId,
} from '@/lib/despiaOneSignal';
import { despiaCall, isDespiaRuntime } from '@/lib/despiaBridge';

const isDespia = isDespiaRuntime();

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
        const { data } = await db.auth.getUser();
        let id = data.user?.id || '';
        if (data.user?.id) {
          const { data: profile } = await db
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
      const pid = await resolveLinkedSubscriptionId(externalId, link.playerId);
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
      const pid = await resolveLinkedSubscriptionId(targetExternalId, link.playerId);
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
      await despiaCall('settingsapp://');
    } catch {
      toast.error('Only works inside the Despia app.');
    }
  };

  const handleSend = async () => {
    if (!externalId && !playerId) {
      toast.error('No target yet.');
      return;
    }
    setSending(true);
    try {
      const targetExternalId = externalId || (await resolveCurrentOneSignalExternalId()) || '';
      let subscriptionIds = targetExternalId ? (await fetchPushSubscriptionStatus(targetExternalId)).subscriptionIds : [];
      if (!subscriptionIds.length && playerId) {
        const relinked = await ensureDespiaOneSignalLinked(targetExternalId, {
          requestPermission: true,
          waitForPlayerIdMs: 2_000,
          persistToken: false,
        });
        if (relinked.permission !== null) setPushEnabled(relinked.permission);
        const pid = await resolveLinkedSubscriptionId(targetExternalId, relinked.playerId || playerId);
        if (pid) {
          subscriptionIds = [pid];
          setPlayerId(pid);
        }
      }

      if (!subscriptionIds.length) {
        toast.error('No OneSignal subscription found yet — reopen VYBE, then tap Re-link device.');
        return;
      }

      const result = await db.functions.invoke('send-push-notification', {
        body: {
          userId: targetExternalId,
          subscriptionId: subscriptionIds[0],
          title: title || 'Notification',
          body: message || ' ',
          tag: 'despia-push-demo',
          type: 'announcement',
        },
      });
      const payload = result.data as { sent?: number; success?: boolean; error?: string } | null;
      if (result.error || !payload?.success) {
        toast.error(`Send failed: ${payload?.error || result.error?.message || 'unknown error'}`);
      } else {
        toast.success(`Sent to ${payload?.sent ?? 1} device(s).`);
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
            Uses the same server push path as Settings → Send me a test push.
          </p>
        </Card>
      </div>
    </div>
  );
}
