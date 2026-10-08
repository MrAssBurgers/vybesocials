export interface IncomingFriendNotice {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: 'pending';
  created_at: string;
  sender?: {
    id: string;
    username: string;
    avatar_url: string | null;
    display_name: string | null;
  };
}

export interface FriendshipStatePayload {
  state?: string;
  request_id?: string | null;
}

/**
 * Recipient reads of `friend_requests` are denied when `profileId()` is empty.
 * `isFriendRequestParty()` requires that id, so a query filtered by
 * `receiver_id == request.auth.uid` still fails. The sender may create a
 * `friend_request` notification. The recipient confirms it with the deployed
 * `getFriendshipState` callable, which returns `request_id` for accept.
 *
 * A rules change that also allows read when
 * `resource.data.sender_id == request.auth.uid || resource.data.receiver_id == request.auth.uid`
 * would make the direct query work. No rules or functions deploy is required
 * for the notification plus callable path.
 */
export function confirmedIncomingRequest(
  notice: { actor_id?: string; created_at?: string },
  state: FriendshipStatePayload | null | undefined,
  receiverId: string,
  sender?: IncomingFriendNotice['sender'],
): IncomingFriendNotice | null {
  const actorId = notice.actor_id?.trim();
  const requestId = state?.request_id?.trim();
  if (!actorId || !receiverId || state?.state !== 'pending_incoming' || !requestId) return null;
  const senderId = sender?.id || actorId;
  return {
    id: requestId,
    sender_id: senderId,
    receiver_id: receiverId,
    status: 'pending',
    created_at: notice.created_at || new Date(0).toISOString(),
    sender: sender ? { ...sender, id: senderId } : undefined,
  };
}

export function keepFriendRequestNotice(
  type: string | undefined,
  actorId: string | undefined,
  pendingSenderIds: ReadonlySet<string>,
  requestsKnown: boolean,
): boolean {
  if (type !== 'friend_request') return true;
  if (!requestsKnown) return true;
  return Boolean(actorId && pendingSenderIds.has(actorId));
}
