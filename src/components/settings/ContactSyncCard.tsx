import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Users, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { normalizeE164, hashPhoneE164 } from '@/lib/phone';

interface Match {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  requested?: boolean;
}

export function ContactSyncCard() {
  const { user } = useAuth();
  const [discoverable, setDiscoverable] = useState(false);
  const [myProfileId, setMyProfileId] = useState<string | null>(null);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [uploadedCount, setUploadedCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: prof }, { count }] = await Promise.all([
        db.from('profiles').select('id, contact_discoverable, phone_verified').eq('user_id', user.id).maybeSingle(),
        db.from('contact_hashes').select('sha256', { count: 'exact', head: true }).eq('user_id', user.id),
      ]);
      if (prof) {
        setDiscoverable(!!prof.contact_discoverable);
        setMyProfileId(prof.id);
        setPhoneVerified(!!prof.phone_verified);
      }
      setUploadedCount(count ?? 0);
    })();
  }, [user?.id]);

  const toggleDiscoverable = async (v: boolean) => {
    if (!user) return;
    if (v && !phoneVerified) {
      toast.error('Verify your phone number first');
      return;
    }
    setDiscoverable(v);
    const { error } = await db
      .from('profiles')
      .update({ contact_discoverable: v })
      .eq('user_id', user.id);
    if (error) {
      setDiscoverable(!v);
      toast.error('Could not update');
    }
  };

  const readNativeContacts = async (): Promise<string[]> => {
    // Despia / Capacitor bridge first (best-effort, optional).
    try {
      const w = window as any;
      if (w?.Despia?.getContacts) {
        const list = await w.Despia.getContacts();
        if (Array.isArray(list)) {
          return list.flatMap((c: any) => (c?.phones || c?.phoneNumbers || []).map((p: any) => p?.number || p));
        }
      }
    } catch { /* fall through */ }

    // Web Contact Picker API
    const nav = navigator as any;
    if (nav?.contacts?.select) {
      try {
        const contacts = await nav.contacts.select(['tel'], { multiple: true });
        return contacts.flatMap((c: any) => c.tel || []);
      } catch (e: any) {
        if (e?.name === 'SecurityError' || e?.name === 'InvalidStateError') {
          throw new Error('contacts_blocked');
        }
        throw new Error('contacts_cancelled');
      }
    }
    throw new Error('contacts_unsupported');
  };

  const syncContacts = async () => {
    if (!user) return;
    setBusy(true); setMatches(null);
    try {
      const raw = await readNativeContacts();
      const e164s = Array.from(new Set(
        raw.map(p => normalizeE164(String(p))).filter((p): p is string => !!p)
      ));
      if (e164s.length === 0) { toast('No phone numbers found in contacts'); return; }
      if (e164s.length > 2000) e164s.length = 2000;

      const hashes = await Promise.all(e164s.map(hashPhoneE164));

      // Upsert into contact_hashes for future re-checks
      const rows = hashes.map(sha256 => ({ user_id: user.id, sha256 }));
      const chunkSize = 500;
      for (let i = 0; i < rows.length; i += chunkSize) {
        await db.from('contact_hashes').upsert(rows.slice(i, i + chunkSize), { onConflict: 'user_id,sha256' });
      }
      setUploadedCount(hashes.length);

      const { data, error } = await db.rpc('match_contacts', { hashes });
      if (error) throw error;
      setMatches((data || []) as Match[]);
      toast.success(`Found ${data?.length ?? 0} friends on VYBE`);
    } catch (e: any) {
      const m = e?.message || '';
      if (m === 'contacts_unsupported') toast.error('Contacts aren\'t available on this device');
      else if (m === 'contacts_blocked') toast.error('Contacts permission was blocked');
      else if (m === 'contacts_cancelled') { /* user cancelled, silent */ }
      else toast.error('Could not sync contacts');
    } finally {
      setBusy(false);
    }
  };

  const addFriend = async (toProfileId: string) => {
    if (!myProfileId) return;
    const { error } = await db
      .from('friend_requests')
      .insert({ sender_id: myProfileId, receiver_id: toProfileId, status: 'pending' });
    if (error && !error.message.includes('duplicate')) {
      toast.error('Could not send request');
      return;
    }
    setMatches(prev => prev?.map(m => m.id === toProfileId ? { ...m, requested: true } : m) ?? null);
    toast.success('Friend request sent');
  };

  const clearUploaded = async () => {
    if (!user) return;
    const { error } = await db.from('contact_hashes').delete().eq('user_id', user.id);
    if (error) { toast.error('Could not clear'); return; }
    setUploadedCount(0);
    setMatches(null);
    toast.success('Uploaded contacts cleared');
  };

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <Users className="w-5 h-5 mt-0.5 text-primary" />
        <div className="flex-1">
          <div className="font-semibold">Find friends from contacts</div>
          <div className="text-xs text-muted-foreground">
            Phone numbers are hashed on your device — we never see or store them in plain text.
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 p-2.5 rounded-lg bg-muted/30">
        <div className="min-w-0">
          <div className="text-sm font-medium">Let friends find me by phone number</div>
          <div className="text-xs text-muted-foreground">Requires a verified phone</div>
        </div>
        <Switch checked={discoverable} onCheckedChange={toggleDiscoverable} disabled={!phoneVerified} />
      </div>

      <Button onClick={syncContacts} disabled={busy} className="w-full mt-3">
        {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
        {uploadedCount > 0 ? 'Re-sync contacts' : 'Sync contacts'}
      </Button>

      {uploadedCount > 0 && (
        <button
          onClick={clearUploaded}
          className="mt-2 text-xs text-muted-foreground hover:text-destructive inline-flex items-center gap-1"
        >
          <Trash2 className="w-3 h-3" /> Clear my uploaded contacts ({uploadedCount})
        </button>
      )}

      {matches && matches.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Friends on VYBE</div>
          {matches.map(m => (
            <div key={m.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/30">
              <Avatar className="w-9 h-9">
                <AvatarImage src={m.avatar_url || undefined} />
                <AvatarFallback>{(m.display_name || m.username || '?').slice(0, 1).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{m.display_name || m.username}</div>
                <div className="text-xs text-muted-foreground truncate">@{m.username}</div>
              </div>
              <Button size="sm" variant={m.requested ? 'ghost' : 'default'} disabled={m.requested} onClick={() => addFriend(m.id)}>
                {m.requested ? 'Requested' : 'Add'}
              </Button>
            </div>
          ))}
        </div>
      )}
      {matches && matches.length === 0 && (
        <div className="mt-3 text-xs text-muted-foreground">
          None of your contacts have opted into discovery yet.
        </div>
      )}
    </Card>
  );
}
