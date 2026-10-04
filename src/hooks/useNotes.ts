import { useEffect, useRef, useState } from 'react';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { tokenAccountGuard, tokenAccountSnapshot } from '@/lib/tokenMarketplaceService';
import { changeOwnNote, readOwnNote, readFriendsNotesPage, type UserNote, type NoteChange } from '@/lib/userNotesService';
export type { UserNote } from '@/lib/userNotesService';

function useNoteScope() {
  const { user, profile } = useAuth();
  const [view, setView] = useState({ now: Date.now(), visible: document.visibilityState !== 'hidden', epoch: 0 });
  useEffect(() => {
    const tick = () => setView(value => ({ ...value, now: Date.now() }));
    const visibility = () => setView(value => ({ now: Date.now(), visible: document.visibilityState !== 'hidden', epoch: value.epoch + 1 }));
    const timer = window.setInterval(tick, 1000);
    document.addEventListener('visibilitychange', visibility);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  const account = tokenAccountSnapshot();
  const valid = !!user?.id && account.uid === user.id && !!profile?.id && profile.user_id === user.id;
  return { identity: { expectedOwnerUid: user?.id ?? '', expectedProfileId: profile?.id ?? '' }, account, valid, ...view };
}
const ownKey = (scope: ReturnType<typeof useNoteScope>) => ['my-note', scope.identity.expectedOwnerUid, scope.account.epoch, scope.identity.expectedProfileId, scope.epoch] as const;
const freshNote = (note: UserNote, state: { receivedAt: number; checkedAt?: number }, now: number) => now < state.receivedAt + Date.parse(note.expires_at) - state.checkedAt;

export function useMyNote() {
  const scope = useNoteScope();
  const query = useQuery({ queryKey: ownKey(scope), queryFn: ({ signal }) => readOwnNote(scope.identity, tokenAccountGuard(scope.identity.expectedOwnerUid), signal),
    enabled: scope.valid && scope.visible, staleTime: 0, gcTime: 0, retry: false, refetchInterval: 20000, refetchOnWindowFocus: 'always' });
  const fresh = scope.valid && scope.visible && !query.isError && !!query.data && query.data.leaseUntil > scope.now;
  return { ...query, data: fresh && query.data?.note && freshNote(query.data.note, query.data, scope.now) ? query.data.note : null,
    state: fresh ? query.data : undefined, isExpired: !!query.data && !fresh, scopeKey: JSON.stringify(ownKey(scope)) };
}
export function useFriendsNotes() {
  const scope = useNoteScope();
  const query = useInfiniteQuery({ queryKey: ['friends-notes', scope.identity.expectedOwnerUid, scope.account.epoch, scope.identity.expectedProfileId, scope.epoch],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => readFriendsNotesPage({ ...scope.identity, ...(pageParam ? { cursor: pageParam } : {}) }, tokenAccountGuard(scope.identity.expectedOwnerUid), signal),
    getNextPageParam: page => page.nextCursor ?? undefined,
    enabled: scope.valid && scope.visible, staleTime: 0, gcTime: 0, retry: false, refetchInterval: 20000, refetchOnWindowFocus: 'always' });
  const seen = new Set<string>(); const notes: UserNote[] = [];
  if (scope.valid && scope.visible && !query.isError) for (const page of query.data?.pages ?? []) {
    if (page.leaseUntil <= scope.now) continue;
    for (const note of page.notes) if (!seen.has(note.user_id) && freshNote(note, page, scope.now)) { seen.add(note.user_id); notes.push(note); }
  }
  return { ...query, data: notes, isExpired: query.data?.pages.some(page => page.leaseUntil <= scope.now) ?? false };
}

type NoteEdit = { content: string; gifUrl?: string; expectedRevision: string | null };
type NoteRemove = { expectedRevision: string | null };
function useNoteChange(action: 'save' | 'delete') {
  const { user, profile } = useAuth(); const client = useQueryClient();
  const attempts = useRef(new Map<string, string>());
  const accountGuard = () => {
    const guard = tokenAccountGuard(user?.id);
    return () => { guard(); if (!profile?.id || profile.user_id !== user?.id) throw new Error('Your profile changed. Reopen notes.'); };
  };
  const mutation = useMutation({
    mutationFn: async (input: NoteEdit | NoteRemove) => {
      const guard = accountGuard(); guard();
      const change: NoteChange = action === 'save' ? { action, content: (input as NoteEdit).content, gifUrl: (input as NoteEdit).gifUrl ?? null } : { action };
      const identity = { expectedOwnerUid: user!.id, expectedProfileId: profile!.id };
      const key = JSON.stringify([identity, input.expectedRevision, change]);
      let requestId = attempts.current.get(key);
      if (!requestId) { requestId = crypto.randomUUID(); attempts.current.set(key, requestId); }
      const receipt = await changeOwnNote({ ...identity, ...change, requestId, expectedRevision: input.expectedRevision }, guard);
      attempts.current.delete(key);
      return { guard, revision: receipt.revision };
    },
    onSuccess: result => { try { result.guard(); void client.invalidateQueries({ queryKey: ['my-note'] }); void client.invalidateQueries({ queryKey: ['friends-notes'] }); } catch { /* Old account. */ } },
  });
  const callbacks = (options: Parameters<typeof mutation.mutate>[1]) => {
    const guard = accountGuard(); const current = () => { try { guard(); return true; } catch { return false; } };
    return { ...options,
      onSuccess: (...args: Parameters<NonNullable<NonNullable<typeof options>['onSuccess']>>) => { if (current()) options?.onSuccess?.(...args); },
      onError: (...args: Parameters<NonNullable<NonNullable<typeof options>['onError']>>) => { if (current()) options?.onError?.(...args); },
      onSettled: (...args: Parameters<NonNullable<NonNullable<typeof options>['onSettled']>>) => { if (current()) options?.onSettled?.(...args); } };
  };
  return { ...mutation, mutate: (input: NoteEdit | NoteRemove, options?: Parameters<typeof mutation.mutate>[1]) => mutation.mutate(input, callbacks(options)) };
}
export const useSetNote = () => useNoteChange('save');
export const useDeleteNote = () => useNoteChange('delete');
