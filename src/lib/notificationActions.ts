import { db } from '@/lib/firebase';
import { navigationRef } from '@/lib/navigationRef';
import type { CallData, CallMode, CallType, CallUser } from '@/lib/callStore';
import { toast } from 'sonner';
import { getRuntimeOs, isNativeAppShell } from '@/lib/despiaBridge';

export type NotificationAction = 'open' | 'accept' | 'decline' | 'reply' | 'view';

export interface NormalizedNotificationPayload {
  type: string;
  action: NotificationAction;
  path?: string;
  url?: string;
  callId?: string;
  conversationId?: string;
  challengeId?: string;
  postId?: string;
  spaceId?: string;
  raw?: Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return undefined;
}

function parseMaybeJson(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === 'object' && parsed ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return null;
}

function normalizeAction(value: unknown): NotificationAction {
  const action = asString(value)?.toLowerCase();
  if (action === 'accept' || action === 'answer') return 'accept';
  if (action === 'decline' || action === 'deny' || action === 'reject') return 'decline';
  if (action === 'reply') return 'reply';
  if (action === 'view') return 'view';
  return 'open';
}

function parseConversationIdFromPath(path?: string): string | undefined {
  if (!path) return undefined;
  const match = path.match(/\/messages\/([^/?#]+)/i);
  return match?.[1];
}

function parseCallIdFromPath(path?: string): string | undefined {
  if (!path) return undefined;
  try {
    const q = path.includes('?') ? path.slice(path.indexOf('?')) : '';
    if (q) {
      const params = new URLSearchParams(q.startsWith('?') ? q.slice(1) : q);
      const call = params.get('call');
      if (call) return call;
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

/** Normalize Despia / OneSignal / service-worker payloads into one shape. */
export function normalizeNotificationPayload(input: unknown): NormalizedNotificationPayload | null {
  const root = parseMaybeJson(input) ?? (typeof input === 'object' && input ? (input as Record<string, unknown>) : null);
  if (!root) return null;

  const nested =
    parseMaybeJson(root.metadata) ??
    parseMaybeJson(root.data) ??
    parseMaybeJson(root.additionalData) ??
    parseMaybeJson(root.custom) ??
    parseMaybeJson(root.custom_data) ??
    {};

  const merged = { ...nested, ...root };
  const type = (
    asString(merged.type) ??
    asString(merged.kind) ??
    asString(merged.notification_type) ??
    (merged.typing === 'true' || merged.typing === true ? 'typing' : undefined) ??
    'general'
  ).toLowerCase();

  const action = normalizeAction(
    merged.action ??
      merged.button_id ??
      merged.buttonId ??
      merged.actionId ??
      merged.event,
  );

  let path = asString(merged.path) ?? asString(merged.url) ?? asString(merged.deepLink) ?? asString(merged.deeplink);
  if (path && /^https?:\/\//i.test(path)) {
    try {
      const u = new URL(path);
      path = `${u.pathname}${u.search}${u.hash}`;
    } catch { /* keep as-is */ }
  }

  const callId = asString(merged.callId) ?? asString(merged.call_id) ?? parseCallIdFromPath(path);
  const conversationId =
    asString(merged.conversationId) ??
    asString(merged.conversation_id) ??
    parseConversationIdFromPath(path);
  const challengeId =
    asString(merged.challengeId) ??
    asString(merged.challenge_id) ??
    (type.includes('login') ? asString(merged.id) : undefined);

  return {
    type,
    action,
    path,
    url: path,
    callId,
    conversationId,
    challengeId,
    postId: asString(merged.postId) ?? asString(merged.post_id),
    spaceId: asString(merged.spaceId) ?? asString(merged.space_id),
    raw: merged,
  };
}

export function buildNotificationRoute(payload: NormalizedNotificationPayload): string {
  if (payload.path && payload.path !== '/') return payload.path;

  switch (payload.type) {
    case 'call':
    case 'incoming_call':
    case 'missed_call':
      if (payload.conversationId) {
        const qs = new URLSearchParams();
        if (payload.callId) qs.set('call', payload.callId);
        if (payload.action === 'accept') qs.set('action', 'accept');
        const suffix = qs.toString() ? `?${qs.toString()}` : '';
        return `/messages/${payload.conversationId}${suffix}`;
      }
      return '/messages';
    case 'message':
    case 'dm':
    case 'group_message':
    case 'typing':
      return payload.conversationId ? `/messages/${payload.conversationId}` : '/messages';
    case 'login_approval':
    case 'security':
      return payload.challengeId ? `/?login-approval=${payload.challengeId}` : '/home';
    case 'friend_request':
      return '/notifications?tab=requests';
    case 'friend_accepted':
    case 'friend_declined':
    case 'smart_ping':
    case 'mention':
      return '/notifications';
    case 'follow':
      return '/notifications';
    case 'follow_request':
      return '/settings?tab=privacy';
    case 'like':
    case 'comment':
      return payload.postId ? `/p/${payload.postId}` : '/notifications';
    case 'space':
      return payload.spaceId ? `/spaces/${payload.spaceId}` : '/spaces';
    case 'streak':
    case 'streak_reminder':
      return '/challenges';
    case 'dna':
      return '/vybe-dna';
    case 'wallet':
    case 'tokens':
      return '/wallet';
    case 'marketplace':
      return '/marketplace';
    default:
      return '/notifications';
  }
}

export async function declineCallById(callId: string): Promise<void> {
  await db
    .from('calls')
    .update({ status: 'declined', ended_at: new Date().toISOString() })
    .eq('id', callId)
    .eq('status', 'ringing');
}

export async function fetchRingingCall(callId: string): Promise<CallData | null> {
  const { data, error } = await db
    .from('calls')
    .select(`
      *,
      caller:profiles!calls_caller_id_fkey(id, username, display_name, avatar_url),
      receiver:profiles!calls_receiver_id_fkey(id, username, display_name, avatar_url)
    `)
    .eq('id', callId)
    .maybeSingle();

  if (error || !data || data.status !== 'ringing') return null;

  const { data: conversation } = await db
    .from('conversations')
    .select('id, name, avatar_url, is_group')
    .eq('id', data.conversation_id)
    .maybeSingle();

  const isGroupCall = data.is_group_call || conversation?.is_group || false;

  return {
    id: data.id,
    roomName: data.room_name || '',
    livekitUrl: '',
    token: '',
    callType: data.call_type as CallType,
    callMode: ((data.call_mode as CallMode) || 'p2p'),
    conversationId: data.conversation_id,
    caller: data.caller as CallUser,
    receiver: data.receiver as CallUser,
    isInitiator: false,
    isGroupCall,
    groupName: conversation?.name || undefined,
    groupAvatar: conversation?.avatar_url || null,
  };
}

export function navigateFromNotification(route: string): void {
  // Guard against mangled `/%3F…` paths from Despia/push URL encoding.
  let safe = route;
  try {
    if (safe.includes('%3F') || safe.includes('%3f')) {
      const decoded = decodeURIComponent(safe);
      if (decoded.startsWith('/?') || decoded.startsWith('?')) {
        safe = decoded.startsWith('/') ? decoded : `/${decoded}`;
      }
    }
  } catch {
    /* keep original */
  }
  // On iOS, external navigation (e.g. https://youtube.com/…) can behave like an
  // unwanted “auto open links” loop when triggered from push handlers before
  // the router fully mounts. In that case, block external navigation and ask
  // user to open links manually later.
  if (/^https?:\/\//i.test(safe)) {
    try {
      if (getRuntimeOs() === 'ios' || isNativeAppShell()) {
        void import('@/lib/externalLinkGuard').then(({ promptExternalLink }) => promptExternalLink(safe));
        return;
      }
    } catch {
      /* ignore */
    }
  }
  if (navigationRef.current) {
    navigationRef.current(safe);
    return;
  }
  if (typeof window !== 'undefined') {
    window.location.assign(safe);
  }
}
