import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Key, Plus, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { passkeysSupported, registerPasskey } from '@/lib/passkeys';
import { formatDistanceToNow } from 'date-fns';

const inNativeApp = (() => { try { return Capacitor.isNativePlatform(); } catch { return false; } })();

interface Passkey {
  id: string;
  device_name: string | null;
  created_at: string;
  last_used_at: string | null;
}

export function PasskeysCard() {
  const { user } = useAuth();
  const [keys, setKeys] = useState<Passkey[]>([]);
  const [busy, setBusy] = useState(false);
  const supported = passkeysSupported();

  const load = async () => {
    if (!user) return;
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
    try {
      const name = `${navigator.platform || 'Device'} • ${new Date().toLocaleDateString()}`;
      await registerPasskey(name);
      toast.success('Passkey added');
      await load();
    } catch (e: any) {
      if (e?.name !== 'NotAllowedError' && e?.name !== 'AbortError') {
        toast.error(e?.message || 'Could not add passkey');
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      const { error } = await supabase.from('user_passkeys').delete().eq('id', id);
      if (error) throw error;
      toast.success('Passkey removed');
      await load();
    } catch {
      toast.error('Could not remove');
    } finally {
      setBusy(false);
    }
  };

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
            {!inNativeApp && (
              <Button size="sm" disabled={!supported || busy} onClick={add}>
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Plus className="w-3.5 h-3.5 mr-1" /> Add</>}
              </Button>
            )}
          </div>

          {inNativeApp && (
            <div className="text-xs text-muted-foreground mt-2">
              To add a passkey, open <span className="font-medium">vybehub.app</span> in Safari or Chrome on this phone and tap “Add”. It will sync to this app via iCloud Keychain or Google Password Manager — then you can sign in here with Face ID / Touch ID.
            </div>
          )}

          {!inNativeApp && !supported && (
            <div className="text-xs text-muted-foreground mt-2">
              Your browser doesn't support passkeys. Try a recent version of Safari, Chrome, or Edge.
            </div>
          )}

          {keys.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {keys.map(k => (
                <div key={k.id} className="flex items-center justify-between gap-3 p-2 rounded-lg bg-muted/30">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{k.device_name || 'Passkey'}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      Added {formatDistanceToNow(new Date(k.created_at), { addSuffix: true })}
                      {k.last_used_at ? ` • Used ${formatDistanceToNow(new Date(k.last_used_at), { addSuffix: true })}` : ''}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => remove(k.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
