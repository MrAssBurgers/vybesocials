import { useEffect, useRef, useState } from 'react';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { tokenAccountGuard, tokenAccountSnapshot } from '@/lib/tokenMarketplaceService';
import { changeOwnNote, readOwnNote, readFriendsNotesPage, type UserNote, type NoteChange } from '@/lib/userNotesService';
export type { UserNote } from '@/lib/userNotesService';

function useNoteScope() {
  const { user, profile } = useAuth();
  const deadlines = useRef<number[]>([]);
  const seenDue = useRef('');
  const [pulse, setPulse] = useState(0);
  const [view, setView] = useState({ visible: typeof document === 'undefined' || document.visibilityState !== 'hidden', epoch: 0 });
  // Record the leases this view is showing. The clock re-renders only when one
  // of them actually expires, not every second the inbox is open.
  const observe = (values: Array<number | null | undefined>) => {
    deadlines.current = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  };
  useEffect(() => {
    const visibility = () => setView(value => ({ visible: document.visibilityState !== 'hidden', epoch: value.epoch + 1 }));
    document.addEventListener('visibilitychange', visibility);
    const timer = window.setInterval(() => {
      const now = Date.now();
      const due = deadlines.current.filter(value => value <= now).join(',');
      if (due === seenDue.current) return;
      seenDue.current = due;
      setPulse(value => value + 1);
    }, 1000);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  void pulse;
  const account = tokenAccountSnapshot();
  const valid = !!user?.id && account.uid === user.id && !!profile?.id && profile.user_id === user.id;
  return { identity: { expectedOwnerUid: user?.id ?? '', expectedProfileId: profile?.id ?? '' }, account, valid, now: Date.now(), observe, ...view };
}
const ownKey = (scope: ReturnType<typeof useNoteScope>) => ['my-note', scope.identity.expectedOwnerUid, scope.account.epoch, scope.identity.expectedProfileId, scope.epoch] as const;
const freshNote = (note: UserNote, state: { receivedAt: number; checkedAt?: number }, now: number) => now < state.receivedAt + Date.parse(note.expires_at) - state.checkedAt;

export function useMyNote() {
  const scope = useNoteScope();
  const query = useQuery({ queryKey: ownKey(scope), queryFn: ({ signal }) => readOwnNote(scope.identity, tokenAccountGuard(scope.identity.expectedOwnerUid), signal),
    enabled: scope.valid && scope.visible, staleTime: 0, gcTime: 0, retry: false, refetchInterval: 20000, refetchOnWindowFocus: 'always' });
  scope.observe([query.data?.leaseUntil, query.data?.note ? Date.parse(query.data.note.expires_at) : undefined]);
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
  const marks: number[] = [];
  for (const page of query.data?.pages ?? []) {
    marks.push(page.leaseUntil);
    for (const note of page.notes) marks.push(Date.parse(note.expires_at));
  }
  scope.observe(marks);
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
