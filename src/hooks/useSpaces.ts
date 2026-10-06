import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSpaceActor } from '@/hooks/useSpaceActor';

export interface Space {
  id: string;
  revision: number;
  host_id: string;
  title: string;
  description: string | null;
  cover_image_url: string | null;
  status: 'scheduled' | 'live' | 'ended';
  scheduled_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  max_speakers: number;
  allow_requests: boolean;
  listener_count: number;
  peak_listeners: number;
  tags: string[];
  daily_room_name: string | null;
  daily_room_url: string | null;
  created_at: string;
  host?: {
    id: string;
    username: string;
    avatar_url: string | null;
    display_name: string | null;
  };
  participants?: SpaceParticipant[];
}

export interface SpaceParticipant {
  id: string;
  revision: number;
  space_id: string;
  user_id: string;
  role: 'host' | 'co_host' | 'speaker' | 'listener' | 'requested';
  is_muted: boolean;
  raised_hand: boolean;
  joined_at: string;
  left_at: string | null;
  audio_pending: boolean;
  audio_generation: number;
  profile?: {
    id: string;
    username: string;
    avatar_url: string | null;
    display_name: string | null;
  };
}

interface RoomRead { space: Space; participants: SpaceParticipant[]; participant: SpaceParticipant | null }
const roomKey = (key: readonly unknown[], id?: string) => ['space', ...key, id] as const;
export function useSpaces(status?: 'live' | 'scheduled') {
  const session = useSpaceActor();
  const result = useQuery({
    queryKey: ['spaces', ...session.key, status], enabled: !!session.actor,
    queryFn: async ({ signal }) => {
      const { actor, guard } = session.capture();
      const { spaceAuthorityRequest } = await import('@/lib/spaceAuthorityClient');
      guard();
      const result = await spaceAuthorityRequest<{ spaces: Space[] }>(actor, { action: 'list', ...(status ? { status } : {}) }, signal);
      guard(); return result.spaces;
    }, staleTime: 10_000, retry: false,
  });
  return { ...result, data: session.actor ? result.data : undefined };
}
function useRoomRead(spaceId?: string) {
  const session = useSpaceActor();
  const result = useQuery({
    queryKey: roomKey(session.key, spaceId), enabled: !!spaceId && !!session.actor,
    queryFn: async ({ signal }) => {
      const { actor, guard } = session.capture();
      const { spaceAuthorityRequest } = await import('@/lib/spaceAuthorityClient');
      guard();
      const result = await spaceAuthorityRequest<RoomRead>(actor, { action: 'read', spaceId }, signal);
      guard(); return result;
    }, staleTime: 4_000, refetchInterval: 5_000, refetchIntervalInBackground: false, retry: false,
  });
  return { ...result, data: session.actor ? result.data : undefined };
}
export function useSpace(spaceId?: string) {
  const result = useRoomRead(spaceId);
  return { ...result, data: result.data?.space };
}
export function useSpaceParticipants(spaceId?: string) {
  const result = useRoomRead(spaceId);
  return { ...result, data: result.data?.participants, ownParticipant: result.data?.participant };
}
function useRoomMutation<I, O>(action: string, prepare: (input: I) => { intent: Record<string, unknown>; spaceId?: string; participantId?: string }) {
  const session = useSpaceActor();
  const cache = useQueryClient();
  return useMutation({
    mutationFn: async (input: I) => {
      const { actor, guard } = session.capture();
      const { spaceAuthorityRequest, spaceMutation } = await import('@/lib/spaceAuthorityClient');
      guard();
      const prepared = prepare(input);
      let revision: number | undefined;
      if (action !== 'create') {
        const snapshot = await cache.fetchQuery({
          queryKey: roomKey(session.key, prepared.spaceId), staleTime: 4_000,
          queryFn: ({ signal }) => spaceAuthorityRequest<RoomRead>(actor, { action: 'read', spaceId: prepared.spaceId }, signal),
        });
        guard();
        revision = action === 'end' ? snapshot.space.revision : action === 'role'
          ? snapshot.participants.find(p => p.id === prepared.participantId)?.revision
          : snapshot.participant?.revision ?? 0;
        if (revision === undefined) throw new Error('Refresh the participants before changing this room.');
      }
      const result = await spaceMutation<Record<string, unknown>>(actor, action, prepared.intent, revision);
      guard();
      // Receipts are historical results. Fetch current membership instead of caching them.
      await Promise.all([cache.invalidateQueries({ queryKey: ['spaces', ...session.key] }), cache.invalidateQueries({ queryKey: roomKey(session.key, prepared.spaceId) })]);
      guard(); return (action === 'create' ? result.space : result) as O;
    }, retry: false,
    onError: () => { void cache.invalidateQueries({ queryKey: ['space', ...session.key] }); },
  });
}
export function useCreateSpace() {
  return useRoomMutation<{ title: string; description?: string; tags?: string[]; scheduledAt?: string }, Space>('create', input => ({ intent: Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) }));
}
export function useJoinSpace() {
  return useRoomMutation<{ spaceId: string; role?: 'listener' | 'requested' }, unknown>('join', input => ({ intent: { spaceId: input.spaceId, role: input.role || 'listener' }, spaceId: input.spaceId }));
}
export function useLeaveSpace() { return useRoomMutation<string, unknown>('leave', spaceId => ({ intent: { spaceId }, spaceId })); }
export function useSetSpaceMute() { return useRoomMutation<{ spaceId: string; isMuted: boolean }, unknown>('mute', input => ({ intent: { ...input }, spaceId: input.spaceId })); }
export function useRaiseHand() { return useRoomMutation<{ spaceId: string; raised: boolean }, unknown>('hand', input => ({ intent: { ...input }, spaceId: input.spaceId })); }
export function useUpdateParticipantRole() { return useRoomMutation<{ participantId: string; spaceId: string; role: string }, unknown>('role', input => ({ intent: { ...input }, spaceId: input.spaceId, participantId: input.participantId })); }
export function useEndSpace() { return useRoomMutation<string, unknown>('end', spaceId => ({ intent: { spaceId }, spaceId })); }
