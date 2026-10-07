import { useEffect, useRef } from 'react';
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';
import { useReportAccountSession } from '@/hooks/useReportAccountSession';
import { ownedDmProfileId, dmListQueryKey, isDmConversationForViewer, viewerDmMembership } from '@/lib/dmAccountScope';
import { reportAccountGuard, reportAccountSnapshot, type ReportAccountSession } from '@/lib/reportModerationService';
import { getDocumentFromServer, updateDocument } from '@/lib/firebase/firestoreDb';
import { readQueryArray, safeDmMembers } from '@/lib/persistedCollections';
import type { LoadedDMConversation } from '@/lib/loadDMConversations';

type Field = 'is_pinned' | 'is_muted';
type Operation = { value: boolean; actor: string; profileId?: string; conversationId: string; session: ReportAccountSession; guard: () => void; accountGuard: () => void; lock: string };
const pendingByClient = new WeakMap<QueryClient, Set<string>>();
const optimisticFields = new WeakMap<object, Partial<Record<Field, symbol>>>();

/** Patch only this session's already populated inbox keys. Rollback preserves
 * independently delivered member objects and never restores a whole list. */
function optimisticPreference(client: QueryClient, field: Field, operation: Operation) {
  const { profileId, session, actor, conversationId, value } = operation;
  const restores: Array<() => void> = [];
  for (const id of new Set([profileId, session.uid].filter((id): id is string => !!id))) {
    const keys = [dmListQueryKey(id, session), ['conversations', id, session.uid, session.epoch]];
    for (const key of keys) {
      const old = client.getQueryData(key);
      if (!Array.isArray(old)) continue;
      const list = readQueryArray<LoadedDMConversation>(old);
      const row = list.find(conv => conv.id === conversationId && isDmConversationForViewer(conv, profileId, session.uid));
      const before = safeDmMembers(row?.members).find(member => member.conversation_id === conversationId && member.user_id === actor);
      if (!before) continue;
      const after = { ...before, [field]: value };
      const token = Symbol(field);
      const markers = { ...optimisticFields.get(before), [field]: token };
      client.setQueryData(key, list.map(conv => conv !== row ? conv : { ...conv, members: safeDmMembers(conv.members).map(member => member === before ? after : member) }));
      // React Query structural sharing can replace the submitted object.
      const insertedRow = client.getQueryData<LoadedDMConversation[]>(key)?.find(conv => conv.id === conversationId);
      const inserted = safeDmMembers(insertedRow?.members).find(member => member.conversation_id === conversationId && member.user_id === actor);
      if (inserted) optimisticFields.set(inserted, markers);
      restores.push(() => {
        let restoredMarkers: Partial<Record<Field, symbol>> | undefined;
        client.setQueryData(key, (current: unknown) => {
          if (!Array.isArray(current)) return current;
          return current.map(conv => conv.id !== conversationId ? conv : {
            ...conv, members: safeDmMembers(conv.members).map(member => {
              if (member.conversation_id !== conversationId || member.user_id !== actor || optimisticFields.get(member)?.[field] !== token || member[field] !== value) return member;
              restoredMarkers = { ...optimisticFields.get(member) };
              delete restoredMarkers[field];
              const restored = { ...member };
              if (Object.prototype.hasOwnProperty.call(before, field)) restored[field] = before[field];
              else delete restored[field];
              return restored;
            }),
          });
        });
        if (restoredMarkers) {
          const restoredRow = client.getQueryData<LoadedDMConversation[]>(key)?.find(conv => conv.id === conversationId);
          const restored = safeDmMembers(restoredRow?.members).find(member => member.conversation_id === conversationId && member.user_id === actor);
          if (restored) optimisticFields.set(restored, restoredMarkers);
        }
      });
    }
  }
  return () => { operation.accountGuard(); restores.forEach(restore => restore()); };
}

/** Existing pin/mute controls: server tuple validation, acknowledged writes,
 * scoped optimism, and account/view guards. No membership creation or repair. */
export function useDmMemberPreference(conversation: LoadedDMConversation, field: Field) {
  const { user, profile, authReady } = useAuth();
  const session = useReportAccountSession();
  const profileId = ownedDmProfileId(user?.id, profile);
  const client = useQueryClient();
  const mounted = useRef(true);
  const view = useRef('');
  const viewId = JSON.stringify([conversation.id, user?.id, profileId, session.epoch]);
  view.current = viewId;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const membership = viewerDmMembership(conversation, profileId, user?.id);
  const label = field === 'is_pinned' ? 'pin' : 'mute';
  const mutation = useMutation({
    mutationFn: async (operation: Operation) => {
      // Explicit intent survives a row moving between pinned/ordinary sections.
      // Account retirement still prevents the next dispatch and its callbacks.
      operation.accountGuard();
      const docId = `${operation.conversationId}_${operation.actor}`;
      const row = await getDocumentFromServer('conversation_members', docId);
      operation.accountGuard();
      if (!row || row.conversation_id !== operation.conversationId || row.user_id !== operation.actor) {
        throw new Error('Your chat membership could not be confirmed. Refresh Messages and try again.');
      }
      await updateDocument('conversation_members', docId, { [field]: operation.value });
      operation.accountGuard();
    },
    onMutate: operation => { operation.guard(); return optimisticPreference(client, field, operation); },
    onSuccess: (_result, operation) => {
      try { operation.accountGuard(); } catch { return; }
      toast.success(field === 'is_pinned' ? (operation.value ? 'Pinned' : 'Unpinned') : (operation.value ? 'Muted' : 'Unmuted'));
    },
    onError: (_error, operation, restore) => {
      try { operation.accountGuard(); restore?.(); } catch { return; }
      toast.error(`Could not update ${label}`);
    },
    onSettled: (_result, _error, operation) => { pendingByClient.get(client)?.delete(operation.lock); },
  });
  const start = (value: boolean) => {
    const guardAccount = reportAccountGuard(user?.id || '');
    const accountGuard = () => {
      guardAccount();
      const current = reportAccountSnapshot();
      if (current.uid !== session.uid || current.epoch !== session.epoch) throw new Error('Your account session changed.');
    };
    const guard = () => {
      accountGuard();
      if (!mounted.current || view.current !== viewId) throw new Error('This chat view changed.');
    };
    guard();
    if (!authReady || !user?.id || session.uid !== user.id || !membership?.user_id) throw new Error('Refresh Messages before updating this chat.');
    const lock = JSON.stringify([session.uid, session.epoch, conversation.id, field]);
    let pending = pendingByClient.get(client);
    if (!pending) { pending = new Set(); pendingByClient.set(client, pending); }
    if (pending.has(lock)) throw new Error(`A ${label} update is already pending.`);
    pending.add(lock);
    return { value, actor: String(membership.user_id), profileId, conversationId: conversation.id, session, guard, accountGuard, lock };
  };
  return {
    ...mutation,
    value: Boolean(membership?.[field]),
    mutate: (value: boolean) => {
      try { mutation.mutate(start(value)); } catch { toast.error(`Could not update ${label}`); }
    },
    mutateAsync: async (value: boolean) => mutation.mutateAsync(start(value)),
  };
}
