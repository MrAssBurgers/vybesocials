/**
 * Snapchat-style per-user presence document — Firestore `users/{profileId}`.
 * Realtime via onSnapshot (no polling).
 */
import {
  documentRef,
  onSnapshot,
  setDocument,
  type Unsubscribe,
} from '@/lib/firebase/firestoreDb';

export type UserActivityState =
  | 'offline'
  | 'online'
  | 'viewing'
  | 'typing'
  | 'recording_voice'
  | 'recording_video'
  | 'taking_photo'
  | 'uploading_image'
  | 'uploading_video'
  | 'sending_vybe'
  | 'in_call';

export interface UserPresenceDoc {
  id: string;
  user_id: string;
  online: boolean;
  last_seen: string;
  active_conversation: string | null;
  typing_in: string | null;
  recording_in: string | null;
  uploading_in: string | null;
  in_call: boolean;
  current_activity: UserActivityState;
  avatar_url?: string | null;
  username?: string;
  display_name?: string | null;
  updated_at?: string;
}

const COLLECTION = 'users';

/** Treat presence as stale if not refreshed within this window (app killed / network drop). */
export const PRESENCE_STALE_MS = 12_000;

function presenceTimestamp(doc: UserPresenceDoc): number {
  const raw = doc.updated_at || doc.last_seen;
  if (!raw) return 0;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export function isPresenceStale(doc: UserPresenceDoc | null): boolean {
  if (!doc) return true;
  const ts = presenceTimestamp(doc);
  if (!ts) return true;
  return Date.now() - ts > PRESENCE_STALE_MS;
}

export function presenceDocId(profileId: string): string {
  return profileId;
}

export async function patchUserPresence(
  profileId: string,
  patch: Partial<Omit<UserPresenceDoc, 'id' | 'user_id'>>,
): Promise<void> {
  if (!profileId) return;
  const now = new Date().toISOString();
  await setDocument(COLLECTION, presenceDocId(profileId), {
    user_id: profileId,
    last_seen: now,
    ...patch,
  });
}

export async function enterConversationPresence(
  profileId: string,
  conversationId: string,
  meta: { avatar_url?: string | null; username?: string; display_name?: string | null },
): Promise<void> {
  await patchUserPresence(profileId, {
    online: true,
    active_conversation: conversationId,
    typing_in: null,
    recording_in: null,
    uploading_in: null,
    in_call: false,
    current_activity: 'viewing',
    avatar_url: meta.avatar_url ?? null,
    username: meta.username,
    display_name: meta.display_name ?? null,
  });
}

export async function leaveConversationPresence(profileId: string): Promise<void> {
  await patchUserPresence(profileId, {
    online: true,
    active_conversation: null,
    typing_in: null,
    recording_in: null,
    uploading_in: null,
    in_call: false,
    current_activity: 'online',
  });
}

/** App backgrounded, screen locked, or tab closed — clear in-chat state everywhere. */
export async function markUserBackgrounded(profileId: string): Promise<void> {
  await patchUserPresence(profileId, {
    online: false,
    active_conversation: null,
    typing_in: null,
    recording_in: null,
    uploading_in: null,
    in_call: false,
    current_activity: 'offline',
  });
}

/** Heartbeat while actively in a conversation (keeps last_seen fresh). */
export async function touchConversationPresence(
  profileId: string,
  conversationId: string,
): Promise<void> {
  if (!profileId || !conversationId) return;
  await patchUserPresence(profileId, {
    online: true,
    active_conversation: conversationId,
    last_seen: new Date().toISOString(),
  });
}

export async function setUserActivity(
  profileId: string,
  conversationId: string | null,
  activity: UserActivityState,
  meta?: { avatar_url?: string | null; username?: string; display_name?: string | null },
): Promise<void> {
  const isTyping = activity === 'typing';
  const isRecording =
    activity === 'recording_voice' || activity === 'recording_video' || activity === 'taking_photo';
  const isUploading =
    activity === 'uploading_image' ||
    activity === 'uploading_video' ||
    activity === 'sending_vybe';

  await patchUserPresence(profileId, {
    online: activity !== 'offline',
    active_conversation: conversationId,
    typing_in: isTyping ? conversationId : null,
    recording_in: isRecording ? conversationId : null,
    uploading_in: isUploading ? conversationId : null,
    in_call: activity === 'in_call',
    current_activity: activity,
    avatar_url: meta?.avatar_url,
    username: meta?.username,
    display_name: meta?.display_name,
  });
}

export function subscribeUserPresence(
  profileId: string,
  onChange: (doc: UserPresenceDoc | null) => void,
  onError?: (err: unknown) => void,
): Unsubscribe {
  if (!profileId) {
    onChange(null);
    return () => {};
  }

  return onSnapshot(
    documentRef(COLLECTION, presenceDocId(profileId)),
    (snap) => {
      if (!snap.exists()) {
        onChange(null);
        return;
      }
      onChange({ id: snap.id, ...(snap.data() as Omit<UserPresenceDoc, 'id'>) });
    },
    (err) => {
      if (import.meta.env.DEV) console.warn('[usersPresence] listen error:', err);
      onError?.(err);
      onChange(null);
    },
  );
}

/** Map stored activity → UI activity for LiveActivityIndicator. */
export function toUiActivity(
  doc: UserPresenceDoc | null,
  conversationId: string,
): UserActivityState {
  if (!doc || !doc.online) return 'offline';
  if (isPresenceStale(doc)) return 'offline';
  if (doc.in_call) return 'in_call';
  if (doc.active_conversation !== conversationId) return 'offline';

  const act = doc.current_activity;
  if (act === 'typing' || doc.typing_in === conversationId) return 'typing';
  if ((act as string) === 'recording_voice' || (doc.recording_in === conversationId && (act as string) === 'recording_voice')) {
    return 'recording_voice';
  }

  if (
    act === 'taking_photo' ||
    act === 'recording_video' ||
    act === 'sending_vybe' ||
    doc.recording_in === conversationId
  ) {
    if (act === 'recording_video') return 'recording_video';
    if (act === 'sending_vybe') return 'sending_vybe';
    return 'taking_photo';
  }
  if (act === 'uploading_image') return 'uploading_image';
  if (act === 'uploading_video') return 'uploading_video';
  if (act === 'viewing' || doc.active_conversation === conversationId) return 'viewing';
  return 'offline';
}
