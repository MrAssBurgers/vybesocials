import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Key, Plus, Trash2, Loader2, Pencil, Check, X, ShieldCheck, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { passkeysSupported, registerPasskey, isAndroidWebViewShell, openInChromeFallback } from '@/lib/passkeys';
import { isDespiaShell, isDespiaPasskeyEnrolled, removeDespiaDevicePasskey } from '@/lib/despiaVault';
import { formatDistanceToNow } from 'date-fns';

interface Passkey {
  id: string;
  device_name: string | null;
  created_at: string;
  last_used_at: string | null;
}

type AddState = 'idle' | 'prompting' | 'success' | 'error';

import { useIsOwner } from '@/hooks/useIsOwner';

export function PasskeysCard() {
  const { user } = useAuth();
  const { isOwner, ready: ownerReady } = useIsOwner();
  const [keys, setKeys] = useState<Passkey[]>([]);
  const [busy, setBusy] = useState(false);
  const [addState, setAddState] = useState<AddState>('idle');
  const [addError, setAddError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const supported = passkeysSupported();
  const despia = isDespiaShell();
  const [despiaEnrolled, setDespiaEnrolled] = useState<boolean>(isDespiaPasskeyEnrolled());

  const load = async () => {
    if (!user) return;
    if (despia) {
      setDespiaEnrolled(isDespiaPasskeyEnrolled());
      return;
    }
    const { data } = await supabase
      .from('user_passkeys')
      .select('id, device_name, created_at, last_used_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setKeys((data as Passkey[]) || []);
  };

  useEffect(() => { load(); }, [user?.id]);

  const add = async () => {
    setBusy(true);
    setAddState('prompting');
    setAddError(null);
    try {
      const name = `${navigator.platform || 'Device'} • ${new Date().toLocaleDateString()}`;
      await registerPasskey(name);
      setAddState('success');
      toast.success('Passkey added');
      await load();
      setTimeout(() => setAddState('idle'), 2000);
    } catch (e: any) {
      if (e?.name === 'NotAllowedError' || e?.name === 'AbortError' || e?.message === 'Cancelled') {
        setAddState('idle');
      } else {
        setAddState('error');
        setAddError(e?.message || 'Could not add passkey');
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      if (id === 'despia-device') {
        await removeDespiaDevicePasskey();
        setDespiaEnrolled(false);
      } else {
        const { error } = await supabase.from('user_passkeys').delete().eq('id', id);
        if (error) throw error;
      }
      toast.success('Passkey removed');
      await load();
    } catch {
      toast.error('Could not remove');
    } finally {
      setBusy(false);
    }
  };

  const startRename = (k: Passkey) => {
    setEditingId(k.id);
    setEditingName(k.device_name || '');
  };

  const saveRename = async () => {
    if (!editingId) return;
    const name = editingName.trim().slice(0, 64);
    if (!name) { setEditingId(null); return; }
    setBusy(true);
    try {
      const { error } = await supabase
        .from('user_passkeys')
        .update({ device_name: name })
        .eq('id', editingId);
      if (error) throw error;
      setKeys(prev => prev.map(k => k.id === editingId ? { ...k, device_name: name } : k));
      setEditingId(null);
      toast.success('Renamed');
    } catch {
      toast.error('Could not rename');
    } finally {
      setBusy(false);
    }
  };

  // Defense in depth: even if a non-owner somehow lands here, render nothing.
  if (ownerReady && !isOwner) return null;

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <Key className="w-5 h-5 mt-0.5 text-primary" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-semibold">Passkeys</div>
              <div className="text-xs text-muted-foreground">
                Sign in instantly with Face ID, Touch ID, Windows Hello, or a security key.
              </div>
            </div>
            <Button size="sm" disabled={!supported || busy} onClick={add}>
              {addState === 'prompting' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : addState === 'success' ? (
                <><ShieldCheck className="w-3.5 h-3.5 mr-1" /> Added</>
              ) : (
                <><Plus className="w-3.5 h-3.5 mr-1" /> Add passkey</>
              )}
            </Button>
          </div>

          {addState === 'prompting' && (
            <div className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" /> Use your device passkey to continue…
            </div>
          )}

          {addState === 'error' && addError && (
            <div className="text-xs text-destructive mt-2 flex items-start gap-1.5">
              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> <span>{addError}</span>
            </div>
          )}

          {!supported && (
            <div className="text-xs text-muted-foreground mt-2">
              Your device doesn't support passkeys yet. Try a recent version of iOS, Android, Safari, Chrome, or Edge.
            </div>
          )}

          {supported && !despia && keys.length === 0 && addState === 'idle' && (
            <div className="text-xs text-muted-foreground mt-2">
              Tap <span className="font-medium">Add passkey</span> — your phone will show its Face ID / fingerprint sheet, just like Discord.
            </div>
          )}

          {despia && !despiaEnrolled && addState === 'idle' && (
            <div className="text-xs text-muted-foreground mt-2">
              Tap <span className="font-medium">Add passkey</span> — VYBE will show your phone's real Face ID / fingerprint prompt and remember this device securely.
            </div>
          )}

          {despia && despiaEnrolled && (
            <div className="mt-3 space-y-1.5">
              <div className="flex items-center justify-between gap-3 p-2 rounded-lg bg-muted/30">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">This device • Face ID / Touch ID</div>
                  <div className="text-xs text-muted-foreground truncate">
                    Stored securely on this device. Survives reinstalls.
                  </div>
                </div>
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" disabled={busy} onClick={() => remove('despia-device')}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}

          {!despia && isAndroidWebViewShell() && (
            <div className="text-xs text-amber-500/90 mt-2 space-y-1.5">
              <div>
                This in-app browser can't open the system passkey sheet. Open VYBE in Chrome once to add a passkey — it'll work in the app afterward.
              </div>
              <button
                type="button"
                onClick={() => openInChromeFallback('/settings')}
                className="underline font-medium"
              >
                Open in Chrome
              </button>
            </div>
          )}

          {!despia && keys.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {keys.map(k => (
                <div key={k.id} className="flex items-center justify-between gap-3 p-2 rounded-lg bg-muted/30">
                  <div className="min-w-0 flex-1">
                    {editingId === k.id ? (
                      <div className="flex items-center gap-1.5">
                        <Input
                          autoFocus
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveRename();
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          maxLength={64}
                          className="h-7 text-sm"
                        />
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={saveRename} disabled={busy}>
                          <Check className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingId(null)}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="text-sm font-medium truncate">{k.device_name || 'Passkey'}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          Added {formatDistanceToNow(new Date(k.created_at), { addSuffix: true })}
                          {k.last_used_at ? ` • Used ${formatDistanceToNow(new Date(k.last_used_at), { addSuffix: true })}` : ''}
                        </div>
                      </>
                    )}
                  </div>
                  {editingId !== k.id && (
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" disabled={busy} onClick={() => startRename(k)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" disabled={busy} onClick={() => remove(k.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
