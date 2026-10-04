import { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCloseFriends, useManageCloseFriend } from '@/hooks/useStories';
import { useStoryAccount } from '@/hooks/useStoryAccount';

/** A deliberate, current-owner selection; legacy entries are never adopted. */
export function CloseFriendsManager({ disabled = false, className }: { disabled?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  const { session } = useStoryAccount();
  useEffect(() => { setOpen(false); }, [session.uid, session.epoch]);
  return <Dialog.Root open={open} onOpenChange={setOpen}>
    <Dialog.Trigger asChild><Button type="button" variant="outline" size="sm" disabled={disabled} className={className}>
      <Users className="mr-2 h-4 w-4" />Manage Close Friends
    </Button></Dialog.Trigger>
    {open && <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[7000] bg-black/75" />
      <Dialog.Content className="fixed left-1/2 top-1/2 z-[7001] flex max-h-[85dvh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-border bg-background p-5 text-foreground shadow-xl">
        <Dialog.Title className="pr-10 text-lg font-semibold">Close Friends</Dialog.Title>
        <Dialog.Description className="mt-2 text-sm text-muted-foreground">Choose who can see your Close Friends stories. Only current friends you explicitly add are included.</Dialog.Description>
        <Dialog.Close asChild><button type="button" aria-label="Close Close Friends" className="absolute right-3 top-3 rounded-md p-2"><X className="h-5 w-5" /></button></Dialog.Close>
        <CloseFriendsContents key={`${session.uid}:${session.epoch}`} />
      </Dialog.Content>
    </Dialog.Portal>}
  </Dialog.Root>;
}

function CloseFriendsContents() {
  const list = useCloseFriends();
  const mutation = useManageCloseFriend();
  const { guard } = useStoryAccount();
  const alive = useRef(false);
  const busy = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const change = async (friendId: string, action: 'add' | 'remove') => {
    if (busy.current) return;
    const current = () => { guard(); if (!alive.current) throw new Error('This view has closed.'); };
    busy.current = true; setError(null); setNotice(null);
    try {
      current(); await mutation.mutateAsync({ friendId, action }); current();
      setNotice(action === 'add' ? 'Close friend added.' : 'Close friend removed.');
    } catch (failure) {
      try { current(); } catch { return; }
      setError(failure instanceof Error ? failure.message : 'The change was not confirmed. Please retry.');
    } finally { busy.current = false; }
  };
  const selected = new Set((list.data || []).map(row => row.friend.id));
  const available = list.candidates.filter(friend => !selected.has(friend.id));
  return <div className="mt-4 space-y-4 overflow-y-auto overscroll-contain pr-1">
    {list.isLoading ? <p role="status">Loading Close Friends…</p> : list.isError ? <div role="alert" className="space-y-2">
      <p>Close Friends could not be loaded. Your selections have not changed.</p>
      <Button type="button" variant="outline" onClick={() => void list.refetch()}>Retry Close Friends</Button>
    </div> : <>
      {list.legacyReview && <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">Choose your Close Friends again. Previous selections need reconfirmation and are not automatically accepted.</p>}
      <section aria-label="Selected Close Friends" className="space-y-2">
        <h3 className="text-sm font-semibold">Selected ({list.data?.length || 0})</h3>
        {!list.data?.length && <p className="text-sm text-muted-foreground">No Close Friends selected yet.</p>}
        {list.data?.map(row => <div key={row.friend.id} className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 p-2">
          <span className="min-w-0 truncate">{row.friend.display_name || row.friend.username}<span className="block text-xs text-muted-foreground">@{row.friend.username}</span></span>
          <Button type="button" size="sm" variant="outline" disabled={mutation.isPending} onClick={() => void change(row.friend.id, 'remove')} aria-label={`Remove ${row.friend.username} from Close Friends`}>Remove</Button>
        </div>)}
      </section>
      <section aria-label="Available friends" className="space-y-2">
        <h3 className="text-sm font-semibold">Add friends</h3>
        {!available.length && !list.hasNextPage && <p className="text-sm text-muted-foreground">No more current friends to add.</p>}
        {available.map(friend => <div key={friend.id} className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 p-2">
          <span className="min-w-0 truncate">{friend.display_name || friend.username}<span className="block text-xs text-muted-foreground">@{friend.username}</span></span>
          <Button type="button" size="sm" disabled={mutation.isPending} onClick={() => void change(friend.id, 'add')} aria-label={`Add ${friend.username} to Close Friends`}>Add</Button>
        </div>)}
        {list.hasNextPage && <Button type="button" variant="outline" disabled={list.isFetchingNextPage || mutation.isPending} onClick={() => void list.fetchNextPage()}>{list.isFetchingNextPage ? 'Loading…' : 'More friends'}</Button>}
      </section>
    </>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
  </div>;
}
