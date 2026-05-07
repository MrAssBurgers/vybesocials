import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { Shield, Smartphone, Mail, Trash2, LogOut, Loader2, QrCode } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { BiometricLockCard } from './BiometricLockCard';
import { PasskeysCard } from './PasskeysCard';
import { QrSignInScannerCard } from './QrSignInScannerCard';

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
    if (s) setSettings(s as any);
    setSessions((sess as Session[]) || []);
    setHistory(h || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user?.id]);

  const updateSetting = async (patch: Partial<Settings2FA>) => {
    if (!user || !settings) return;
    setSettings({ ...settings, ...patch });
    const { error } = await supabase.from('user_2fa_settings').update(patch).eq('user_id', user.id);
    if (error) {
      toast.error('Could not save');
      load();
    } else {
      toast.success('Saved');
    }
  };

  const revoke = async (sessionId?: string, all = false) => {
    setBusy(true);
    try {
      const { error } = await supabase.functions.invoke('auth-session-revoke', { body: { sessionId, all } });
      if (error) throw error;
      toast.success(all ? 'Signed out everywhere' : 'Session revoked');
      await load();
    } catch (e) {
      toast.error('Could not revoke session');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center p-8"><Loader2 className="w-5 h-5 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      {/* Email 2FA */}
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <Mail className="w-5 h-5 mt-0.5 text-primary" />
          <div className="flex-1">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold">Email 2-Step Verification</div>
                <div className="text-xs text-muted-foreground">Email a 6-digit code on every sign-in.</div>
              </div>
              <Switch
                checked={!!settings?.email_2fa_enabled}
                onCheckedChange={(v) => updateSetting({ email_2fa_enabled: v })}
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Login approvals */}
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 mt-0.5 text-primary" />
          <div className="flex-1">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold">Login Approvals</div>
                <div className="text-xs text-muted-foreground">Require approval from a trusted device for new sign-ins.</div>
              </div>
              <Switch
                checked={!!settings?.login_approvals_enabled}
                onCheckedChange={(v) => updateSetting({ login_approvals_enabled: v })}
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Passkeys */}
      <PasskeysCard />

      {/* Biometric app lock (Despia native) */}
      <BiometricLockCard />

      {/* Quick QR sign-in (claim from signed-out device) */}
      <QrSignInScannerCard />

      {/* Active sessions */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold">Active devices</div>
          {sessions.length > 1 && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => revoke(undefined, true)}>
              <LogOut className="w-3.5 h-3.5 mr-1.5" /> Sign out everywhere
            </Button>
          )}
        </div>
        {sessions.length === 0 ? (
          <div className="text-sm text-muted-foreground">No active sessions tracked yet.</div>
        ) : (
          <div className="space-y-2">
            {sessions.map(s => (
              <div key={s.id} className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-muted/30">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{s.device_label || 'Unknown device'}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {[s.city, s.country].filter(Boolean).join(', ') || s.ip || 'Unknown'} • {formatDistanceToNow(new Date(s.last_seen_at), { addSuffix: true })}
                  </div>
                </div>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => revoke(s.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Login history */}
      {history.length > 0 && (
        <Card className="p-4">
          <div className="font-semibold mb-3">Recent login activity</div>
          <div className="space-y-1.5">
            {history.map(h => (
              <div key={h.id} className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="truncate">
                  {h.success ? '✓' : '✗'} {h.method} • {h.device_label || 'Unknown'} • {[h.city, h.country].filter(Boolean).join(', ') || 'Unknown'}
                </span>
                <span className="shrink-0 ml-2">{formatDistanceToNow(new Date(h.created_at), { addSuffix: true })}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
