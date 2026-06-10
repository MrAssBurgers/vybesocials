import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Shield, Mail, Trash2, LogOut, Loader2 } from 'lucide-react';
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
  country: string | null;
  ip: string | null;
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
      supabase.rpc('ensure_2fa_settings'),
      supabase.from('user_sessions').select('*').eq('user_id', user.id).is('revoked_at', null).order('last_seen_at', { ascending: false }),
      supabase.from('login_history').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(10),
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
    const { data, error } = await supabase.rpc('update_2fa_settings', {
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
    const { data: fresh } = await supabase.rpc('ensure_2fa_settings');
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
      const { error } = await supabase.functions.invoke('auth-session-revoke', { body: { sessionId, all } });
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
            title="Login Approvals"
            description="Require approval from a trusted device for new sign-ins"
            checked={!!settings?.login_approvals_enabled}
            onCheckedChange={(v) => updateSetting({ login_approvals_enabled: v })}
          />
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
          <div className="space-y-2">
            {sessions.map((s) => (
              <SettingsListRow
                key={s.id}
                title={s.device_label || 'Unknown device'}
                subtitle={`${[s.city, s.country].filter(Boolean).join(', ') || s.ip || 'Unknown'} · ${formatDistanceToNow(new Date(s.last_seen_at), { addSuffix: true })}`}
                action={
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => revoke(s.id)} className="h-8 w-8 p-0 rounded-full">
                    <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                  </Button>
                }
              />
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
