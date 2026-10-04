import { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFollowAuthority, useFollowManagement } from '@/hooks/useFollowAuthority';
import type { FollowWrite } from '@/lib/followService';

export function FollowRequestsManager() {
  const [open, setOpen] = useState(false); const account = useFollowAuthority();
  useEffect(() => { setOpen(false); }, [account.session.uid, account.session.epoch]);
  return <Dialog.Root open={open} onOpenChange={setOpen}>
    <Dialog.Trigger asChild><Button variant="outline" className="min-h-11 w-full rounded-full" disabled={!account.ready}><Users className="mr-2 h-4 w-4" />Followers & requests</Button></Dialog.Trigger>
    {open && <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-[7000] bg-black/60 backdrop-blur-sm" />
      <Dialog.Content className="fixed left-1/2 top-1/2 z-[7001] flex max-h-[85dvh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col rounded-3xl border border-border bg-background p-5 text-foreground shadow-xl">
        <Dialog.Title className="pr-10 text-lg font-semibold">Your followers</Dialog.Title>
        <Dialog.Description className="mt-2 text-sm text-muted-foreground">Review follow requests and remove access whenever you want.</Dialog.Description>
        <Dialog.Close asChild><button className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full" aria-label="Close followers"><X className="h-5 w-5" /></button></Dialog.Close>
        <FollowContents key={`${account.session.uid}:${account.session.epoch}`} />
      </Dialog.Content></Dialog.Portal>}
  </Dialog.Root>;
}
function FollowContents() {
  const [view, setView] = useState<'requests' | 'followers'>('requests');
  const list = useFollowManagement(view); const { mutation, guard } = useFollowAuthority();
  const [notice, setNotice] = useState<string | null>(null); const [error, setError] = useState<string | null>(null);
  const alive = useRef(true); const busy = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const change = async (input: FollowWrite) => {
    if (busy.current) return; busy.current = true; setError(null); setNotice(null);
    const current = () => { guard(); if (!alive.current) throw new Error('This view closed.'); };
    try { current(); await mutation.mutateAsync(input); current(); setNotice(input.action === 'approve' ? 'Request approved.' : input.action === 'decline' ? 'Request declined.' : 'Follower removed.'); }
    catch (failure) { try { current(); } catch { return; } setError(failure instanceof Error ? failure.message : 'The change was not confirmed.'); void list.refetch(); }
    finally { busy.current = false; }
  };
  const rows = [...new Map((list.data?.pages.flatMap(page => page.relationships) ?? []).map(row => [row.relationshipId, row])).values()];
  return <div className="mt-4 space-y-4 overflow-y-auto overscroll-contain">
    <div className="flex gap-2" aria-label="Follower lists">{(['requests', 'followers'] as const).map(tab => <Button key={tab} type="button" aria-pressed={view === tab} variant={view === tab ? 'secondary' : 'ghost'} className="min-h-11 flex-1 rounded-full" onClick={() => { setView(tab); setError(null); setNotice(null); }}>{tab === 'requests' ? 'Requests' : 'Followers'}</Button>)}</div>
    {list.isLoading ? <p role="status">Loading followers…</p> : list.isError ? <div role="alert"><p>Followers could not be loaded.</p><Button variant="outline" onClick={() => void list.refetch()}>Retry followers</Button></div> : <>
      {!rows.length && <p className="rounded-2xl bg-muted/40 p-4 text-sm text-muted-foreground">{list.hasNextPage ? 'More entries are available below.' : view === 'requests' ? 'No pending requests. New requests will appear here.' : 'No verified followers yet. Earlier follows need a new request to confirm private access.'}</p>}
      {rows.map(row => <div key={row.relationshipId} className="space-y-3 rounded-2xl bg-muted/40 p-3">
        <p className="truncate font-medium">{row.follower.displayName || row.follower.username || 'Unavailable account'}{row.follower.username && <span className="block text-xs font-normal text-muted-foreground">@{row.follower.username}</span>}</p>
        <div className="flex gap-2">{row.status === 'pending' && row.canApprove && <Button className="min-h-11 flex-1 rounded-full" disabled={mutation.isPending} onClick={() => void change({ action: 'approve', relationshipId: row.relationshipId, revision: row.revision })} aria-label={`Approve ${row.follower.username || 'request'}`}>Approve</Button>}
          <Button variant="outline" className="min-h-11 flex-1 rounded-full" disabled={mutation.isPending} onClick={() => void change({ action: row.status === 'pending' ? 'decline' : 'remove', relationshipId: row.relationshipId, revision: row.revision })} aria-label={`${row.status === 'pending' ? 'Decline' : 'Remove'} ${row.follower.username || 'account'}`}>{row.status === 'pending' ? 'Decline' : 'Remove'}</Button></div>
      </div>)}
      {list.hasNextPage && <Button variant="outline" className="min-h-11 w-full rounded-full" disabled={list.isFetchingNextPage || mutation.isPending} onClick={() => void list.fetchNextPage()}>{list.isFetchingNextPage ? 'Loading…' : 'Load more'}</Button>}
    </>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{notice && <p role="status" className="text-sm">{notice}</p>}
  </div>;
}
