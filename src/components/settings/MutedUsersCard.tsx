import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { VolumeX } from 'lucide-react';
import { toast } from 'sonner';
import { useFeedMuteActions } from '@/hooks/useFeedMutes';
import { isFeedMuteSessionError, type FeedMute } from '@/lib/feedMuteService';
import { getUserProfile } from '@/lib/firebase/users';
import { Button } from '@/components/ui/button';

export function MutedUsersCard() {
  const mutes = useFeedMuteActions('settings');
  return <MutedUsersForSession key={mutes.sessionKey} mutes={mutes} />;
}

function MutedUsersForSession({ mutes }: { mutes: ReturnType<typeof useFeedMuteActions> }) {
  const [visible, setVisible] = useState(25);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState('');
  const unmute = async (row: FeedMute) => {
    if (pending) return;
    setPending(row.profileId); setError('');
    try {
      await mutes.unmute(row.profileId); mutes.assertCurrent();
      toast.success('Account unmuted in feeds.');
    } catch (failure) {
      if (!isFeedMuteSessionError(failure) && mutes.isCurrent()) setError('Unmute was not saved. Please try again.');
    } finally { if (mutes.isCurrent()) setPending(null); }
  };
  return <section className="liquid-glass-card p-4 sm:p-6" aria-labelledby="muted-feeds-title">
    <h4 id="muted-feeds-title" className="mb-1 flex items-center gap-2 font-medium"><VolumeX className="h-4 w-4" />Muted in feeds</h4>
    <p className="mb-4 text-sm text-muted-foreground">These accounts' posts and clips are hidden from your feeds. You can still visit their profiles. Messages, notifications, and blocks are unchanged.</p>
    {error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
    {mutes.isError && <div role="alert" className="mb-3"><p className="text-sm">{mutes.needsRepair ? 'A saved mute could not be verified. Remove the marked record below to restore your feeds, then mute the account again if needed.' : 'Your feed mutes could not be refreshed.'}</p><Button variant="outline" className="mt-2" onClick={() => void mutes.refetch()}>Retry</Button></div>}
    {mutes.rows === undefined ? (!mutes.isError && <p role="status">Loading saved feed mutes…</p>)
        : !mutes.rows?.length ? <p className="text-sm text-muted-foreground">No muted accounts.</p>
          : <><ul className="divide-y divide-border/40">{mutes.rows.slice(0, visible).map(row => <MutedAccountRow key={row.profileId} row={row} mutes={mutes} pending={pending} onUnmute={() => void unmute(row)} />)}</ul>
            {visible < mutes.rows.length && <Button variant="outline" className="mt-3" onClick={() => setVisible(value => value + 25)}>Show more</Button>}</>}
  </section>;
}

function MutedAccountRow({ row, mutes, pending, onUnmute }: { row: FeedMute; mutes: ReturnType<typeof useFeedMuteActions>; pending: string | null; onUnmute: () => void }) {
  const profile = useQuery({ queryKey: [...mutes.key, 'profile', row.profileId], gcTime: 0, retry: false, enabled: !row.needsRepair,
    queryFn: async () => { mutes.assertCurrent(); const result = await getUserProfile(row.profileId); mutes.assertCurrent(); return result; } });
  const name = row.needsRepair ? 'Saved mute needs repair' : profile.data?.display_name || profile.data?.username || 'Unavailable account';
  return <li className="flex min-h-16 items-center gap-3 py-3">
    <div className="min-w-0 flex-1">{profile.data?.username
      ? <Link className="block truncate text-sm font-medium hover:underline" to={`/u/${encodeURIComponent(profile.data.username)}`}>{name}</Link>
      : <p className="truncate text-sm font-medium">{!row.needsRepair && profile.isPending ? 'Loading account…' : name}</p>}
      {profile.data?.username && <p className="truncate text-xs text-muted-foreground">@{profile.data.username}</p>}
    </div>
    <Button size="sm" variant="outline" disabled={pending !== null} onClick={onUnmute} aria-label={row.needsRepair ? 'Remove invalid saved mute' : `Unmute ${name} in feeds`}>{pending === row.profileId ? 'Saving…' : row.needsRepair ? 'Remove' : 'Unmute'}</Button>
  </li>;
}
