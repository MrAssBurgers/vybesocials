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

  // Link external_id to the device on this page (every authenticated load pattern).
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
      toast.success('Device linked to external_id');
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

  const handleSend = async () => {
    if (!externalId) {
      toast.error('No external_id yet.');
      return;
    }
    setSending(true);
    try {
      const res = await fetch('https://onesignal.com/api/v1/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${ONESIGNAL_REST_KEY}`,
        },
        body: JSON.stringify({
          app_id: ONESIGNAL_APP_ID,
          include_external_user_ids: [externalId],
          headings: { en: title || 'Notification' },
          contents: { en: message || ' ' },
        }),
      });
      const json = await res.json();
      if (!res.ok || json?.errors) {
        console.error('OneSignal error:', json);
        toast.error(`Send failed: ${JSON.stringify(json?.errors || json)}`);
      } else if (json?.recipients === 0) {
        toast.warning('Sent, but no recipients matched this external_id yet.');
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

  return (
    <div className="min-h-screen bg-background page-scroll-fix p-4 md:p-8">
      <div className="mx-auto w-full max-w-xl space-y-4">
        <h1 className="text-2xl font-bold">Despia Push Demo</h1>
        <p className="text-sm text-muted-foreground">
          {isDespia
            ? 'Running inside Despia — your external_id is linked to this device.'
            : 'Not running inside Despia. The textarea will show your external_id, but linking and notifications will only deliver inside the native Despia app.'}
        </p>

        <Card className="space-y-3 p-4">
          <label className="text-sm font-medium">Your external_id (OneSignal target)</label>
          <Textarea
            readOnly
            value={externalId}
            className="font-mono text-xs"
            rows={3}
            onFocus={(e) => e.currentTarget.select()}
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={copyId}>
              Copy ID
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
            {sending ? 'Sending…' : 'Send push notification'}
          </Button>
          <p className="text-[10px] text-muted-foreground">
            Demo only — calls OneSignal REST API directly from the browser. Move this to an edge
            function before shipping.
          </p>
        </Card>
      </div>
    </div>
  );
}
