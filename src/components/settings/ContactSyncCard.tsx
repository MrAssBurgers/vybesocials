import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Users, Loader2, Trash2, MessageCircle, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { useSendFriendRequest } from '@/hooks/useFriends';
import { useMyInvite } from '@/hooks/useInvites';
import { hashPhoneE164, formatDisplayUS } from '@/lib/phone';
import { flattenContactPhones, readDeviceContacts } from '@/lib/nativeContacts';
import { isDespiaRuntime } from '@/lib/despiaBridge';

interface Match {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  phone_hash: string;
  contact_name?: string;
  requested?: boolean;
}

interface InviteRow {
  e164: string;
  contact_name: string;
  invited?: boolean;
}

export function ContactSyncCard() {
  const { user } = useAuth();
  const sendFriendRequest = useSendFriendRequest();
  const { data: invite } = useMyInvite();
  const [discoverable, setDiscoverable] = useState(false);
  const [myProfileId, setMyProfileId] = useState<string | null>(null);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [invites, setInvites] = useState<InviteRow[] | null>(null);
  const [uploadedCount, setUploadedCount] = useState(0);

  const runtimeLabel = useMemo(() => {
    if (isDespiaRuntime()) return 'Uses your phone’s Contacts app';
    if (typeof navigator !== 'undefined' && 'contacts' in navigator) {
      return 'Uses this browser’s contact picker';
    }
    return 'Open VYBE in the phone app to sync your address book';
  }, []);

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

  // Backfill discovery hash from private profile phone when already verified.
  useEffect(() => {
    if (!user || !phoneVerified) return;
    void (async () => {
      try {
        const { data } = await db.rpc('get_my_private_profile');
        const row = Array.isArray(data) ? data[0] : data;
        const phone = row?.phone_number as string | undefined;
        if (!phone?.startsWith('+')) return;
        const sha = await hashPhoneE164(phone);
        await db.from('profiles').update({ phone_e164_sha256: sha }).eq('user_id', user.id);
      } catch {
        /* best-effort */
      }
    })();
  }, [user?.id, phoneVerified]);

  const syncContacts = async () => {
    if (!user) return;
    setBusy(true);
    setMatches(null);
    setInvites(null);
    try {
      const deviceContacts = await readDeviceContacts();
      const flattened = flattenContactPhones(deviceContacts);
      if (flattened.length === 0) {
        toast('No phone numbers found in contacts');
        return;
      }

      const hashes = await Promise.all(flattened.map((c) => hashPhoneE164(c.e164)));
      const nameByHash = new Map<string, string>();
      flattened.forEach((c, i) => {
        nameByHash.set(hashes[i], c.name || formatDisplayUS(c.e164));
      });

      const rows = hashes.map((sha256) => ({ user_id: user.id, sha256 }));
      const chunkSize = 500;
      for (let i = 0; i < rows.length; i += chunkSize) {
        await db.from('contact_hashes').upsert(rows.slice(i, i + chunkSize), { onConflict: 'user_id,sha256' });
      }
      setUploadedCount(hashes.length);

      const { data, error } = await db.rpc('match_contacts', { hashes });
      if (error) throw error;
      const matched = ((data || []) as Match[]).map((m) => ({
        ...m,
        contact_name: nameByHash.get(m.phone_hash) || undefined,
      }));
      setMatches(matched);

      const matchedHashes = new Set(matched.map((m) => m.phone_hash));
      const inviteRows: InviteRow[] = flattened
        .map((c, i) => ({
          e164: c.e164,
          contact_name: c.name || formatDisplayUS(c.e164),
          hash: hashes[i],
        }))
        .filter((r) => !matchedHashes.has(r.hash))
        .slice(0, 40)
        .map(({ e164, contact_name }) => ({ e164, contact_name }));
      setInvites(inviteRows);

      toast.success(
        matched.length
          ? `Found ${matched.length} friend${matched.length === 1 ? '' : 's'} on VYBE`
          : `Synced ${flattened.length} contacts — invite friends below`,
      );
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : '';
      if (m === 'contacts_unsupported') toast.error("Contacts aren't available on this device");
      else if (m === 'contacts_blocked') toast.error('Contacts permission was blocked');
      else if (m === 'contacts_cancelled') { /* silent */ }
      else toast.error('Could not sync contacts');
    } finally {
      setBusy(false);
    }
  };

  const addFriend = async (toProfileId: string) => {
    if (!myProfileId) return;
    try {
      await sendFriendRequest.mutateAsync(toProfileId);
      setMatches((prev) => prev?.map((m) => (m.id === toProfileId ? { ...m, requested: true } : m)) ?? null);
      toast.success('Friend request sent');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e ?? '');
      if (!/already|duplicate|exists/i.test(message)) {
        toast.error('Could not send request');
        return;
      }
      setMatches((prev) => prev?.map((m) => (m.id === toProfileId ? { ...m, requested: true } : m)) ?? null);
      toast.success('Friend request sent');
    }
  };

  const inviteContact = async (row: InviteRow) => {
    const code = invite?.invite_code;
    const url = code ? `https://vybehub.app/invite/${code}` : 'https://vybehub.app';
    const body = `Join me on VYBE! ${url}`;
    const digits = row.e164.replace(/[^\d+]/g, '');
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Join me on VYBE', text: body, url });
      } else {
        window.location.href = `sms:${encodeURIComponent(digits)}?&body=${encodeURIComponent(body)}`;
      }
      setInvites((prev) => prev?.map((r) => (r.e164 === row.e164 ? { ...r, invited: true } : r)) ?? null);
    } catch {
      try {
        await navigator.clipboard.writeText(body);
        toast.success('Invite link copied');
        setInvites((prev) => prev?.map((r) => (r.e164 === row.e164 ? { ...r, invited: true } : r)) ?? null);
      } catch {
        toast.error('Could not open invite share');
      }
    }
  };

  const clearUploaded = async () => {
    if (!user) return;
    const { error } = await db.from('contact_hashes').delete().eq('user_id', user.id);
    if (error) {
      toast.error('Could not clear');
      return;
    }
    setUploadedCount(0);
    setMatches(null);
    setInvites(null);
    toast.success('Uploaded contacts cleared');
  };

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <Users className="w-5 h-5 mt-0.5 text-primary" />
        <div className="flex-1">
          <div className="font-semibold">Find friends from contacts</div>
          <div className="text-xs text-muted-foreground">
            {runtimeLabel}. Numbers are hashed on your device — we never store them in plain text.
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
          type="button"
          onClick={clearUploaded}
          className="mt-2 text-xs text-muted-foreground hover:text-destructive inline-flex items-center gap-1"
        >
          <Trash2 className="w-3 h-3" /> Clear my uploaded contacts ({uploadedCount})
        </button>
      )}

      {matches && matches.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="text-xs font-medium text-muted-foreground">On VYBE</div>
          {matches.map((m) => (
            <div key={m.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/30">
              <Avatar className="w-9 h-9">
                <AvatarImage src={m.avatar_url || undefined} />
                <AvatarFallback>
                  {(m.contact_name || m.display_name || m.username || '?').slice(0, 1).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {m.contact_name || m.display_name || m.username}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {m.contact_name
                    ? `@${m.username}${m.display_name ? ` · ${m.display_name}` : ''}`
                    : `@${m.username}`}
                </div>
              </div>
              <Button
                size="sm"
                variant={m.requested ? 'ghost' : 'default'}
                disabled={m.requested}
                onClick={() => addFriend(m.id)}
                className="gap-1"
              >
                <UserPlus className="w-3.5 h-3.5" />
                {m.requested ? 'Requested' : 'Add'}
              </Button>
            </div>
          ))}
        </div>
      )}

      {invites && invites.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Invite to VYBE</div>
          {invites.map((row) => (
            <div key={row.e164} className="flex items-center gap-3 p-2 rounded-lg bg-muted/30">
              <Avatar className="w-9 h-9">
                <AvatarFallback>{row.contact_name.slice(0, 1).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{row.contact_name}</div>
                <div className="text-xs text-muted-foreground truncate">{formatDisplayUS(row.e164)}</div>
              </div>
              <Button
                size="sm"
                variant={row.invited ? 'ghost' : 'secondary'}
                disabled={row.invited}
                onClick={() => inviteContact(row)}
                className="gap-1"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                {row.invited ? 'Shared' : 'Invite'}
              </Button>
            </div>
          ))}
        </div>
      )}

      {matches && matches.length === 0 && invites && invites.length === 0 && (
        <div className="mt-3 text-xs text-muted-foreground">
          None of your contacts are discoverable on VYBE yet.
        </div>
      )}
    </Card>
  );
}
