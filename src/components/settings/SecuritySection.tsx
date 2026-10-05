import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Shield, Mail, LogOut, Loader2, MapPin, MonitorSmartphone } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { PasskeysCard } from './PasskeysCard';
import { QrSignInScannerCard } from './QrSignInScannerCard';
import { PhoneNumberCard } from './PhoneNumberCard';
import { ContactSyncCard } from './ContactSyncCard';
import { useIsOwner } from '@/hooks/useIsOwner';
import { SettingsSectionCard, SettingsPanel, SettingsToggleRow } from './SettingsUI';
import { useReportAccountSession } from '@/hooks/useReportAccountSession';
import { tokenAccountGuard } from '@/lib/tokenMarketplaceService';
import { readSignInPreferences, updateSignInPreference, readSecurityDevices, readSecurityHistory, revokeAllSecuritySessions,
  type SignInPreferences, type SignInPreference, type SecurityDevice, type SecurityDeviceCursor, type SecurityLogin } from '@/lib/securitySettingsService';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { prepareSecurityRevokeAttempt, checkSecurityRevokeSignIn, completeSecurityRevokeAttempt, retireSecurityRevokeAttempt } from '@/lib/securitySessionAttempt';

type Loaded<T> = { scope: string | null; data: T | null; loading: boolean; error: string | null };
const empty = <T,>(): Loaded<T> => ({ scope: null, data: null, loading: false, error: null });
const message = (error: unknown) => error instanceof Error ? error.message : 'This could not be confirmed. Please retry.';
const relative = (date: string | null) => date ? formatDistanceToNow(new Date(date), { addSuffix: true }) : 'Time unavailable';
type Devices = { devices: SecurityDevice[]; cursor: SecurityDeviceCursor | null };

export function SecuritySection() {
  const { user, signOut } = useAuth();
  const { isOwner } = useIsOwner();
  const account = useReportAccountSession();
  const scope = user && account.uid === user.id ? `${user.id}:${account.epoch}` : null;
  const live = useRef({ scope, load: 0 });
  if (live.current.scope !== scope) live.current = { scope, load: live.current.load + 1 };
  const [preferences, setPreferences] = useState<Loaded<SignInPreferences>>(empty);
  const [devices, setDevices] = useState<Loaded<Devices>>(empty);
  const [history, setHistory] = useState<Loaded<SecurityLogin[]>>(empty);
  const [operation, setOperation] = useState<{ scope: string; type: 'save' | 'revoke' | 'page' } | null>(null);
  const lock = useRef<typeof operation>(null);
  const [operationError, setOperationError] = useState<{ scope: string; message: string } | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const saveAttempt = useRef<{ key: string; id: string } | null>(null);
  const currentPreferences = preferences.scope === scope ? preferences : empty<SignInPreferences>();
  const currentDevices = devices.scope === scope ? devices : empty<Devices>();
  const currentHistory = history.scope === scope ? history : empty<SecurityLogin[]>();
  const busy = !!scope && operation?.scope === scope;

  const load = async () => {
    if (!user || !scope) return;
    const captured = scope, request = ++live.current.load, guard = tokenAccountGuard(user.id);
    const pending = { scope: captured, data: null, loading: true, error: null };
    setPreferences(pending); setDevices(pending); setHistory(pending);
    const results = await Promise.allSettled([readSignInPreferences(user.id, guard), readSecurityDevices(user.id, guard), readSecurityHistory(user.id, guard)]);
    if (live.current.scope !== captured || live.current.load !== request) return;
    try { guard(); } catch { return; }
    const result = <T,>(value: PromiseSettledResult<T>): Loaded<T> => value.status === 'fulfilled'
      ? { scope: captured, data: value.value, loading: false, error: null }
      : { scope: captured, data: null, loading: false, error: message(value.reason) };
    setPreferences(result(results[0])); setDevices(result(results[1])); setHistory(result(results[2]));
  };
  useEffect(() => { void load(); return () => { live.current.load++; lock.current = null; }; }, [scope]);

  const begin = (type: 'save' | 'revoke' | 'page') => {
    if (!user || !scope || lock.current?.scope === scope) return null;
    const guard = tokenAccountGuard(user.id); try { guard(); } catch { return null; }
    const token = { scope, type }; lock.current = token; setOperation(token); setOperationError(null);
    return { uid: user.id, scope, token, guard: () => { guard(); if (live.current.scope !== scope || lock.current !== token) throw new Error('Your account changed. Reopen security settings.'); } };
  };
  const end = (token: NonNullable<typeof operation>) => { if (lock.current === token) { lock.current = null; setOperation(null); } };
  const fail = (error: unknown, op: NonNullable<ReturnType<typeof begin>>) => {
    try { op.guard(); } catch { return; }
    setOperationError({ scope: op.scope, message: message(error) });
  };
  const updateSetting = async (field: SignInPreference, value: boolean) => {
    if (!currentPreferences.data) return;
    const op = begin('save'); if (!op) return;
    const key = `${op.scope}:${currentPreferences.data.revision}:${field}:${value}`;
    if (saveAttempt.current?.key !== key) saveAttempt.current = { key, id: crypto.randomUUID() };
    try {
      const saved = await updateSignInPreference(op.uid, currentPreferences.data, field, value, saveAttempt.current.id, op.guard);
      op.guard(); live.current.load++;
      setPreferences({ scope: op.scope, data: saved, loading: false, error: null });
      saveAttempt.current = null; toast.success('Sign-in preference saved');
    } catch (error) { fail(error, op); }
    finally { end(op.token); }
  };
  const loadMore = async () => {
    if (!currentDevices.data?.cursor) return;
    const op = begin('page'); if (!op) return;
    try {
      const page = await readSecurityDevices(op.uid, op.guard, currentDevices.data.cursor); op.guard();
      const merged = new Map(currentDevices.data.devices.map(device => [device.id, device]));
      page.devices.forEach(device => merged.set(device.id, device));
      if (page.cursor?.id === currentDevices.data.cursor.id) throw new Error('Device paging could not advance. Please refresh.');
      setDevices({ scope: op.scope, data: { devices: [...merged.values()], cursor: page.cursor }, loading: false, error: null });
    } catch (error) { fail(error, op); setDevices(previous => previous.scope === op.scope ? { ...previous, data: null, error: message(error) } : previous); }
    finally { end(op.token); }
  };
  const revoke = async () => {
    const op = begin('revoke'); if (!op) return;
    try {
      const attempt = await prepareSecurityRevokeAttempt(op.uid, op.guard); op.guard();
      await revokeAllSecuritySessions(op.uid, attempt.requestId, attempt.authTime, op.guard); op.guard();
      await checkSecurityRevokeSignIn(op.uid, attempt.authTime, op.guard); op.guard();
      completeSecurityRevokeAttempt(op.uid, attempt.requestId, op.guard); setConfirmation(null);
      toast.success('Account-wide sign-out confirmed. Existing access may continue until current sessions expire.');
      await signOut();
    } catch (error) { fail(error, op); }
    finally { end(op.token); }
  };
  const retire = async () => {
    const op = begin('revoke'); if (!op) return;
    try { retireSecurityRevokeAttempt(op.uid, op.guard); op.guard(); await signOut(); }
    catch (error) { fail(error, op); }
    finally { end(op.token); }
  };
  const retry = <T,>(state: Loaded<T>, label: string) => state.loading ? <p role="status" className="text-sm text-muted-foreground">Loading {label}…</p>
    : state.error ? <div role="alert" className="space-y-2 text-sm"><p>{state.error}</p><Button size="sm" variant="secondary" disabled={busy} onClick={() => void load()}>Retry {label}</Button></div> : null;
  const saved = currentPreferences.data;

  return (
    <div className="space-y-5">
      <PhoneNumberCard /><ContactSyncCard />
      <SettingsSectionCard icon={Shield} title="Sign-in confirmation" description="Saved preferences for additional sign-in checks" delay={0.05}>
        {retry(currentPreferences, 'sign-in preferences')}
        {saved && <SettingsPanel className="space-y-0">
          <SettingsToggleRow icon={Mail} title="Email confirmation" description="A code check during supported interactive sign-ins"
            checked={saved.settings.email_2fa_enabled} disabled={busy || (!saved.settings.email_2fa_enabled && !saved.capabilities.enableEmailConfirmation)}
            onCheckedChange={value => void updateSetting('email_2fa_enabled', value)} />
          <SettingsToggleRow icon={Shield} title="Login confirmation" description="A confirmation request during supported new-device sign-ins"
            checked={saved.settings.login_approvals_enabled} disabled={busy || (!saved.settings.login_approvals_enabled && !saved.capabilities.enableLoginApprovals)}
            onCheckedChange={value => void updateSetting('login_approvals_enabled', value)} />
          {(!saved.capabilities.enableEmailConfirmation || !saved.capabilities.enableLoginApprovals) && <p className="px-3 pb-3 text-xs text-muted-foreground">New activation is unavailable while these sign-in checks are being updated. Existing saved choices are shown above and can be turned off.</p>}
          <p className="px-3 pb-3 text-xs text-muted-foreground">These preferences do not protect every sign-in method or an already active session.</p>
        </SettingsPanel>}
      </SettingsSectionCard>
      {operationError?.scope === scope && <div role="alert" className="rounded-xl border border-destructive/30 p-3 text-sm">{operationError.message}<Button variant="ghost" size="sm" disabled={busy} onClick={() => void load()}>Refresh security details</Button></div>}
      {isOwner && <PasskeysCard />}<QrSignInScannerCard />
      <SettingsSectionCard icon={Shield} title="Tracked devices" description="Recorded device activity may differ from currently valid sign-ins" delay={0.1}>
        {retry(currentDevices, 'devices')}
        {currentDevices.data && <div className="space-y-3">
          {currentDevices.data.devices.length === 0 && <p className="py-3 text-sm text-muted-foreground">No active devices are recorded.</p>}
          {currentDevices.data.devices.map(device => <div key={device.id} className="rounded-2xl border border-white/10 p-3 text-sm">
            <p className="flex gap-2 items-center font-semibold"><MonitorSmartphone className="h-4 w-4 text-primary" />{device.deviceLabel}</p>
            <p className="mt-2 flex gap-2 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5 shrink-0" />{device.location || device.ip || 'Approximate location unavailable'}</p>
            <p className="mt-2 text-xs text-muted-foreground">Last active: {relative(device.lastSeenAt)}</p>
          </div>)}
          {currentDevices.data.cursor && <Button variant="secondary" size="sm" disabled={busy} onClick={() => void loadMore()}>Load more devices</Button>}
        </div>}
        <p className="mt-4 text-xs text-muted-foreground">Signing out a single device is not available. Account-wide sign-out also signs out this device; access may continue until existing sessions expire.</p>
        <Button className="mt-3" variant="outline" disabled={!scope || busy} onClick={() => setConfirmation(scope)}><LogOut className="mr-2 h-4 w-4" />Sign out all devices</Button>
      </SettingsSectionCard>
      <SettingsSectionCard title="Recent login activity" description="Last 10 recorded sign-in attempts" delay={0.15}>
        {retry(currentHistory, 'login activity')}
        {currentHistory.data?.length === 0 && <p className="text-sm text-muted-foreground">No login activity is recorded.</p>}
        {currentHistory.data?.map(row => <div key={row.id} className="flex justify-between gap-3 py-2 text-xs text-muted-foreground"><span>{row.success === true ? '✓ ' : row.success === false ? '✗ ' : ''}{row.method} · {row.deviceLabel} · {row.location || 'Location unavailable'}</span><span className="shrink-0">{relative(row.createdAt)}</span></div>)}
      </SettingsSectionCard>
      <AlertDialog open={!!scope && confirmation === scope} onOpenChange={open => { if (!open && !busy) setConfirmation(null); }}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Sign out all devices?</AlertDialogTitle><AlertDialogDescription>This affects your entire account, including this device. Devices will need to sign in again when their credentials are checked. Existing access can continue until current sessions expire.</AlertDialogDescription></AlertDialogHeader>
          {operationError?.scope === scope && <div role="alert" className="space-y-2 text-sm"><p className="text-destructive">{operationError.message}</p><p>Clearing this request signs out only this device. It does not confirm account-wide sign-out.</p><Button variant="secondary" disabled={busy} onClick={() => void retire()}>Sign out here and clear this request</Button></div>}
          <AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={event => { event.preventDefault(); void revoke(); }}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirm account-wide sign-out</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
