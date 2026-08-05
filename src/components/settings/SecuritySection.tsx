import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Shield, Mail, Trash2, LogOut, Loader2, MapPin, MonitorSmartphone } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { PasskeysCard } from './PasskeysCard';
import { QrSignInScannerCard } from './QrSignInScannerCard';
import { PhoneNumberCard } from './PhoneNumberCard';
import { ContactSyncCard } from './ContactSyncCard';
import { useIsOwner } from '@/hooks/useIsOwner';
import {
  SettingsSectionCard,
  SettingsPanel,
  SettingsToggleRow,
  SettingsListRow,
} from './SettingsUI';
import { Skeleton } from '@/components/ui/skeleton';

interface Session {
  id: string;
  device_label: string | null;
  city: string | null;
  region?: string | null;
  country: string | null;
  ip: string | null;
  trusted?: boolean | null;
  last_seen_at: string;
  created_at: string;
}

interface Settings2FA {
  email_2fa_enabled: boolean;
  login_approvals_enabled: boolean;
}

export function SecuritySection() {
  const { user } = useAuth();
  const { isOwner } = useIsOwner();
  const [settings, setSettings] = useState<Settings2FA | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [{ data: s }, { data: sess }, { data: h }] = await Promise.all([
      db.rpc('ensure_2fa_settings'),
      db.from('user_sessions').select('*').eq('user_id', user.id).is('revoked_at', null).order('last_seen_at', { ascending: false }),
      db.from('login_history').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(10),
    ]);
    const row = Array.isArray(s) ? s[0] : s;
    setSettings(row ?? { email_2fa_enabled: false, login_approvals_enabled: false });
    setSessions((sess as Session[]) || []);
    setHistory(h || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user?.id]);

  const updateSetting = async (patch: Partial<Settings2FA>) => {
    if (!user || !settings) return;
    const prev = settings;
    const next = { ...settings, ...patch };
    setSettings(next);
    const { data, error } = await db.rpc('update_2fa_settings', {
      p_email_2fa: next.email_2fa_enabled,
      p_login_approvals: next.login_approvals_enabled,
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) {
      setSettings(prev);
      toast.error(error?.message ? `Could not save: ${error.message}` : 'Could not save');
      return;
    }
    setSettings({
      email_2fa_enabled: !!row.email_2fa_enabled,
      login_approvals_enabled: !!row.login_approvals_enabled,
    });
    toast.success('Saved');
    // When enabling login confirmation, ensure this install is marked trusted
    // so it can approve future sign-ins from other devices.
    if (patch.login_approvals_enabled === true) {
      void import('@/hooks/useSessionTracking').then(({ notifyFreshLogin }) => {
        void notifyFreshLogin('login_approval_enable');
      });
    }
    const { data: fresh } = await db.rpc('ensure_2fa_settings');
    const freshRow = Array.isArray(fresh) ? fresh[0] : fresh;
    if (freshRow) {
      setSettings({
        email_2fa_enabled: !!freshRow.email_2fa_enabled,
        login_approvals_enabled: !!freshRow.login_approvals_enabled,
      });
    }
  };

  const revoke = async (sessionId?: string, all = false) => {
    setBusy(true);
    try {
      const { error } = await db.functions.invoke('auth-session-revoke', { body: { sessionId, all } });
      if (error) throw error;
      toast.success(all ? 'Signed out everywhere' : 'Session revoked');
      await load();
    } catch {
      toast.error('Could not revoke session');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PhoneNumberCard />
      <ContactSyncCard />

      <SettingsSectionCard
        icon={Shield}
        title="Two-Factor & Approvals"
        description="Extra layers to keep your account secure"
        delay={0.05}
      >
        <SettingsPanel className="space-y-0">
          <SettingsToggleRow
            icon={Mail}
            title="Email 2-Step Verification"
            description="Email a 6-digit code on every sign-in"
            checked={!!settings?.email_2fa_enabled}
            onCheckedChange={(v) => updateSetting({ email_2fa_enabled: v })}
          />
          <SettingsToggleRow
            icon={Shield}
            title="Login confirmation"
            description="Your other signed-in device gets a push + in-app prompt to approve new logins. You can also fall back to email or SMS codes."
            checked={!!settings?.login_approvals_enabled}
            onCheckedChange={(v) => updateSetting({ login_approvals_enabled: v })}
          />
          <p className="px-3 pb-3 text-xs text-muted-foreground">
            SMS fallback needs a verified phone number above. Email codes go to your account email.
          </p>
        </SettingsPanel>
      </SettingsSectionCard>

      {isOwner && <PasskeysCard />}
      <QrSignInScannerCard />

      <SettingsSectionCard
        icon={Shield}
        iconClassName="from-emerald-400/20 to-green-600/10 ring-emerald-500/20"
        title="Active devices"
        description="Sessions currently signed in to your account"
        delay={0.1}
      >
        {sessions.length > 1 && (
          <div className="flex justify-end mb-3">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => revoke(undefined, true)} className="rounded-full h-8 text-xs">
              <LogOut className="w-3.5 h-3.5 mr-1.5" /> Sign out everywhere
            </Button>
          </div>
        )}
        {sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No active sessions tracked yet.</p>
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => (
              <ActiveDeviceRow key={s.id} session={s} busy={busy} onRevoke={() => revoke(s.id)} />
            ))}
          </div>
        )}
      </SettingsSectionCard>

      {history.length > 0 && (
        <SettingsSectionCard
          title="Recent login activity"
          description="Last 10 sign-in attempts"
          delay={0.15}
        >
          <div className="space-y-1.5">
            {history.map((h) => (
              <div
                key={h.id}
                className="flex items-center justify-between gap-2 py-2 px-3 rounded-lg text-xs text-muted-foreground border-b border-foreground/[0.04] last:border-0"
              >
                <span className="truncate">
                  <span className={h.success ? 'text-emerald-500' : 'text-destructive'}>{h.success ? '✓' : '✗'}</span>
                  {' '}{h.method} · {h.device_label || 'Unknown'} · {[h.city, h.country].filter(Boolean).join(', ') || 'Unknown'}
                </span>
                <span className="shrink-0">{formatDistanceToNow(new Date(h.created_at), { addSuffix: true })}</span>
              </div>
            ))}
          </div>
        </SettingsSectionCard>
      )}
    </div>
  );
}

function ActiveDeviceRow({
  session,
  busy,
  onRevoke,
}: {
  session: Session;
  busy: boolean;
  onRevoke: () => void;
}) {
  const place = [session.city, session.region, session.country].filter(Boolean).join(', ');
  const location = place || session.ip || 'Approximate location unavailable';
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <MonitorSmartphone className="h-4 w-4 text-primary shrink-0" />
            <p className="truncate text-sm font-semibold">{session.device_label || 'Unknown device'}</p>
            {session.trusted && (
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                Trusted
              </span>
            )}
          </div>
          <div className="mt-2 rounded-xl border border-primary/15 bg-primary/5 px-3 py-2">
            <div className="flex items-start gap-2 text-xs">
              <MapPin className="mt-0.5 h-3.5 w-3.5 text-primary shrink-0" />
              <div className="min-w-0">
                <p className="font-medium text-foreground/90">{location}</p>
                {session.ip && (
                  <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">IP {session.ip}</p>
                )}
              </div>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Last active {formatDistanceToNow(new Date(session.last_seen_at), { addSuffix: true })}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={onRevoke}
          className="h-9 shrink-0 rounded-full px-3 text-xs"
        >
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          Revoke
        </Button>
      </div>
    </div>
  );
}
