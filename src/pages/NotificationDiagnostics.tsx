import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useUserRoleById } from '@/hooks/useUserRoleById';
import { db } from '@/lib/firebase';
import { isDespiaRuntime } from '@/lib/despiaBridge';
import { checkDespiaPushPermission, readWindowPlayerId } from '@/lib/despiaOneSignal';
import {
  getPushRegistrationStatus,
  healthCheckPushRegistration,
  registerPushDevice,
} from '@/lib/notifications/NotificationRegistrationService';
import { exportPushDebugText, readPushDiagnostics } from '@/lib/notifications/pushDiagnostics';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

const DEV_USERNAMES = ['bakrix', 'mrassburgers'];

function Row({ label, value }: { label: string; value: string | number | boolean | null | undefined }) {
  const display =
    value === null || value === undefined
      ? '—'
      : typeof value === 'boolean'
        ? value ? 'yes' : 'no'
        : String(value);
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-border/40 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-mono text-right break-all">{display}</span>
    </div>
  );
}

export default function NotificationDiagnostics() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { data: role } = useUserRoleById(user?.id);
  const isDevUser = !!profile?.username && DEV_USERNAMES.includes(profile.username.toLowerCase());
  const isAdmin = role === 'admin' || role === 'owner' || isDevUser;

  const [snap, setSnap] = useState(() => readPushDiagnostics());
  const [nativePermission, setNativePermission] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (isDespiaRuntime()) {
      setNativePermission(await checkDespiaPushPermission());
    } else if (typeof Notification !== 'undefined') {
      setNativePermission(Notification.permission === 'granted');
    }
    setSnap(getPushRegistrationStatus());
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      navigate('/settings', { replace: true });
      return;
    }
    void refresh();
    const id = window.setInterval(() => setSnap(getPushRegistrationStatus()), 3000);
    return () => window.clearInterval(id);
  }, [isAdmin, navigate, refresh]);

  if (!isAdmin) return null;

  const onTestPush = async () => {
    if (!profile?.id) return;
    setBusy('test');
    try {
      const { data, error } = await db.functions.invoke('send-push-notification', {
        body: {
          userId: profile.id,
          title: 'VYBE test',
          body: 'Push diagnostics test — if you see this, delivery works.',
          type: 'general',
          url: '/settings/notification-diagnostics',
        },
      });
      if (error) throw error;
      toast.success(`Test sent (${(data as { sent?: number })?.sent ?? 0} devices)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Test push failed');
    } finally {
      setBusy(null);
      void refresh();
    }
  };

  const onForceReregister = async () => {
    setBusy('reregister');
    try {
      const ok = await registerPushDevice('force_reregister', { force: true, requestPermission: false });
      await healthCheckPushRegistration();
      toast[ok ? 'success' : 'error'](ok ? 'Re-registration complete' : 'Re-registration failed');
    } finally {
      setBusy(null);
      void refresh();
    }
  };

  const onCopy = async () => {
    const text = exportPushDebugText();
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Debug info copied');
    } catch {
      toast.error('Could not copy — see console');
      console.log(text);
    }
  };

  return (
    <div className="container max-w-lg py-8 px-4 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Notification diagnostics</h1>
        <p className="text-sm text-muted-foreground mt-1">Admin-only push registration health</p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Device &amp; permission</CardTitle>
        </CardHeader>
        <CardContent>
          <Row label="Push permission (native)" value={nativePermission} />
          <Row label="Registration state" value={snap.state} />
          <Row label="Platform" value={snap.platform} />
          <Row label="Despia runtime" value={isDespiaRuntime()} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Identifiers</CardTitle>
        </CardHeader>
        <CardContent>
          <Row label="Profile ID (external_id)" value={snap.externalUserId || profile?.id} />
          <Row label="Auth UID" value={snap.authUserId || user?.id} />
          <Row label="Device ID" value={snap.deviceId} />
          <Row label="Player / subscription ID" value={snap.subscriptionId || readWindowPlayerId()} />
          <Row label="Server subscription count" value={snap.serverSubscriptionCount} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <Row label="Last successful registration" value={snap.lastRegisteredAt} />
          <Row label="Last registration reason" value={snap.lastRegistrationReason} />
          <Row label="Last registration error" value={snap.lastRegistrationError} />
          <Row label="Last notification received" value={snap.lastNotificationReceivedAt} />
          <Row label="Last notification opened" value={snap.lastNotificationOpenedAt} />
          <Row label="Last health check" value={snap.lastHealthCheckAt} />
          <Row label="Registration retry count" value={snap.registrationRetryCount} />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <Button disabled={!!busy} onClick={() => void onTestPush()}>
          {busy === 'test' ? 'Sending…' : 'Test notification'}
        </Button>
        <Button variant="secondary" disabled={!!busy} onClick={() => void onForceReregister()}>
          {busy === 'reregister' ? 'Registering…' : 'Force re-register'}
        </Button>
        <Button variant="outline" onClick={() => void onCopy()}>
          Copy debug information
        </Button>
        <Button variant="ghost" onClick={() => void refresh()}>
          Refresh
        </Button>
      </div>

      {snap.registrationHistory.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Registration history</CardTitle>
          </CardHeader>
          <CardContent className="max-h-48 overflow-y-auto font-mono text-xs space-y-1">
            {[...snap.registrationHistory].reverse().slice(0, 15).map((h, i) => (
              <div key={i} className={h.ok ? 'text-green-600' : 'text-red-500'}>
                {h.at} · {h.reason} · {h.ok ? 'ok' : 'fail'}
                {h.detail ? ` · ${h.detail}` : ''}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
