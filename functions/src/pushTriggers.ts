import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { db } from './_shared/admin.js';
import { dispatchDmPushToProfile, dispatchCallPushToProfile, messagePreview } from './_shared/fcmPush.js';
import { resolvePushTargetProfileId } from './_shared/onesignalPush.js';

function asString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return undefined;
}

async function resolveProfileRecord(id: string): Promise<{ id: string; user_id?: string; display_name?: string; username?: string; avatar_url?: string } | null> {
  const direct = await db.collection('profiles').doc(id).get();
  if (direct.exists) {
    const data = direct.data() || {};
    return {
      id: direct.id,
      user_id: asString(data.user_id),
      display_name: asString(data.display_name),
      username: asString(data.username),
      avatar_url: asString(data.avatar_url),
    };
  }
  const byAuth = await db.collection('profiles').where('user_id', '==', id).limit(1).get();
  if (!byAuth.empty) {
    const doc = byAuth.docs[0];
    const data = doc.data();
    return {
      id: doc.id,
      user_id: asString(data.user_id),
      display_name: asString(data.display_name),
      username: asString(data.username),
      avatar_url: asString(data.avatar_url),
    };
  }
  return null;
}

async function senderIdentityIds(senderId: string): Promise<Set<string>> {
  const ids = new Set<string>([senderId]);
  const profile = await resolveProfileRecord(senderId);
  if (profile?.id) ids.add(profile.id);
  if (profile?.user_id) ids.add(profile.user_id);
  return ids;
}

function isSenderMember(senderIds: Set<string>, memberUserId: string): boolean {
  return senderIds.has(memberUserId);
}

type PrefKey = 'dms_enabled' | 'calls_enabled' | 'comments_enabled' | 'likes_enabled' | 'follows_enabled';

async function isPushEnabledForProfile(profileId: string, key: PrefKey): Promise<boolean> {
  const snap = await db
    .collection('notification_preferences')
    .where('user_id', '==', profileId)
    .limit(1)
    .get();
  if (snap.empty) return true;
  const data = snap.docs[0].data();
  return data[key] !== false;
}

async function notifyDmRecipients(message: Record<string, unknown>, messageId: string): Promise<void> {
  if (message.is_deleted === true) return;
  if (message.is_optimistic === true) return;

  const conversationId = asString(message.conversation_id);
  const rawSenderId = asString(message.sender_id);
  if (!conversationId || !rawSenderId) return;

  const senderProfile = await resolveProfileRecord(rawSenderId);
  const senderIds = await senderIdentityIds(rawSenderId);
  const canonicalSenderId = senderProfile?.id || rawSenderId;
  const senderName =
    asString(senderProfile?.display_name) ||
    asString(senderProfile?.username) ||
    'Someone';
  const senderAvatar = asString(senderProfile?.avatar_url);

  const [convSnap, membersSnap] = await Promise.all([
    db.collection('conversations').doc(conversationId).get(),
    db.collection('conversation_members').where('conversation_id', '==', conversationId).get(),
  ]);

  const conversation = convSnap.data() || {};
  const isGroup = conversation.is_group === true;
  const title = isGroup ? (asString(conversation.name) || senderName) : senderName;
  const body = messagePreview(message);
  const type = isGroup ? 'group_message' : 'dm';
  const url = `/messages/${conversationId}`;

  const recipientUserIds = new Set<string>();
  for (const doc of membersSnap.docs) {
    const member = doc.data();
    const memberUserId = asString(member.user_id);
    if (!memberUserId || member.is_muted === true) continue;
    if (isSenderMember(senderIds, memberUserId)) continue;
    recipientUserIds.add(memberUserId);
  }

  // Deterministic 1:1 chats may only have member_ids on the conversation doc.
  if (!recipientUserIds.size) {
    const memberIds = conversation.member_ids;
    if (Array.isArray(memberIds)) {
      for (const id of memberIds) {
        const pid = asString(id);
        if (!pid || isSenderMember(senderIds, pid)) continue;
        recipientUserIds.add(pid);
      }
    }
  }

  await Promise.all(
    [...recipientUserIds].map(async (recipientUserId) => {
      const recipientProfileId = await resolvePushTargetProfileId(recipientUserId);

      const pushAllowed = await isPushEnabledForProfile(recipientProfileId, 'dms_enabled');
      if (!pushAllowed) return;

      const pushResult = await dispatchDmPushToProfile(recipientProfileId, {
        title,
        body,
        url,
        tag: `vybe-dm-${conversationId}`,
        type,
        data: {
          conversationId,
          senderId: canonicalSenderId,
          senderName,
          senderAvatar: senderAvatar || '',
          messageId,
          preview: body,
          path: url,
        },
      });

      if (pushResult.sent === 0) {
        console.warn('[onDmMessageCreated] no push targets for', recipientProfileId, conversationId);
      }
    }),
  );
}

async function notifyCallRecipients(call: Record<string, unknown>, callId: string): Promise<void> {
  if (asString(call.status) !== 'ringing') return;

  const callerId = asString(call.caller_id);
  const conversationId = asString(call.conversation_id);
  const receiverId = asString(call.receiver_id);
  const isGroup = call.is_group_call === true;
  const callType = asString(call.call_type) || 'audio';

  if (!callerId || !conversationId) return;

  const [callerSnap, convSnap] = await Promise.all([
    db.collection('profiles').doc(callerId).get(),
    db.collection('conversations').doc(conversationId).get(),
  ]);
  const caller = callerSnap.data() || {};
  const conversation = convSnap.data() || {};
  const callerName = asString(caller.display_name) || asString(caller.username) || 'Someone';
  const callTypeLabel = callType === 'video' ? 'FaceTime' : 'audio call';
  const title = isGroup
    ? `${asString(conversation.name) || 'Group'} • Incoming ${callTypeLabel}`
    : `Incoming ${callTypeLabel}`;
  const body = `${callerName} is calling…`;
  const url = `/messages/${conversationId}?call=${callId}`;

  const recipientIds = new Set<string>();
  if (receiverId && receiverId !== callerId) recipientIds.add(receiverId);

  if (isGroup) {
    const members = await db
      .collection('conversation_members')
      .where('conversation_id', '==', conversationId)
      .get();
    for (const doc of members.docs) {
      const uid = asString(doc.data().user_id);
      if (uid && uid !== callerId) recipientIds.add(uid);
    }
  }

  const participantIds = call.participant_ids;
  if (Array.isArray(participantIds)) {
    for (const id of participantIds) {
      const pid = asString(id);
      if (pid && pid !== callerId) recipientIds.add(pid);
    }
  }

  await Promise.all(
    [...recipientIds].map(async (recipientId) => {
      const recipientProfileId = await resolvePushTargetProfileId(recipientId);
      const pushAllowed = await isPushEnabledForProfile(recipientProfileId, 'calls_enabled');
      if (!pushAllowed) return;

      const pushResult = await dispatchCallPushToProfile(recipientProfileId, {
        title,
        body,
        url,
        tag: `vybe-call-${callId}`,
        type: 'call',
        data: {
          type: 'call',
          callId,
          conversationId,
          callType,
          callerId,
          callerName,
          path: url,
          action: 'open',
        },
      });
      if (pushResult.sent === 0) {
        console.warn('[onCallCreated] no push targets for', recipientProfileId);
      }
    }),
  );
}

const ONESIGNAL_SECRETS = ['ONESIGNAL_APP_ID', 'ONESIGNAL_REST_API_KEY'] as const;

/** Flat messages collection (primary DM path after Firebase migration). */
export const onDmMessageCreated = onDocumentCreated(
  { document: 'messages/{messageId}', region: 'us-central1', secrets: [...ONESIGNAL_SECRETS] },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    try {
      await notifyDmRecipients(snap.data() as Record<string, unknown>, snap.id);
    } catch (err) {
      console.error('[onDmMessageCreated]', err);
    }
  },
);

/** Subcollection path (future / dual-write). */
export const onConversationMessageCreated = onDocumentCreated(
  { document: 'conversations/{cid}/messages/{messageId}', region: 'us-central1', secrets: [...ONESIGNAL_SECRETS] },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const data = snap.data() as Record<string, unknown>;
    if (!data.conversation_id) {
      data.conversation_id = event.params.cid;
    }
    try {
      await notifyDmRecipients(data, snap.id);
    } catch (err) {
      console.error('[onConversationMessageCreated]', err);
    }
  },
);

/** Incoming call ring — high-priority FCM to callee(s). */
export const onCallCreated = onDocumentCreated(
  { document: 'calls/{callId}', region: 'us-central1', secrets: [...ONESIGNAL_SECRETS] },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    try {
      await notifyCallRecipients(snap.data() as Record<string, unknown>, snap.id);
    } catch (err) {
      console.error('[onCallCreated]', err);
    }
  },
);

const SOCIAL_PUSH_TYPES = new Set([
  'like',
  'comment',
  'follow',
  'friend_request',
  'friend_accepted',
  'friend_declined',
  'mention',
  'smart_ping',
  'announcement',
  'content_removed',
  'map_wave',
  'map_meetup',
]);

const SKIP_BELL_PUSH_TYPES = new Set(['message', 'dm', 'group_message', 'missed_call']);

function prefKeyForNotificationType(type: string): PrefKey | null {
  switch (type) {
    case 'like':
      return 'likes_enabled';
    case 'comment':
      return 'comments_enabled';
    case 'follow':
    case 'friend_request':
    case 'friend_accepted':
    case 'friend_declined':
      return 'follows_enabled';
    default:
      return null;
  }
}

function routeForNotificationDoc(n: Record<string, unknown>, type: string): string {
  const deep = asString(n.deep_link) ?? asString(n.url);
  if (deep) {
    if (deep.startsWith('/')) return deep;
    if (/^https?:\/\//i.test(deep)) {
      try {
        const u = new URL(deep);
        return `${u.pathname}${u.search}${u.hash}`;
      } catch {
        return deep;
      }
    }
    return `/${deep}`;
  }
  const postId = asString(n.post_id);
  const conversationId = asString(n.conversation_id);
  switch (type) {
    case 'like':
    case 'comment':
    case 'mention':
      return postId ? `/p/${postId}` : '/notifications';
    case 'friend_request':
      return '/notifications?tab=requests';
    case 'friend_accepted':
    case 'friend_declined':
      return '/notifications';
    case 'message':
    case 'dm':
    case 'group_message':
      return conversationId ? `/messages/${conversationId}` : '/messages';
    case 'map_wave':
    case 'map_meetup':
      return '/map';
    default:
      return '/notifications';
  }
}

async function notifySocialPush(notification: Record<string, unknown>, notificationId: string): Promise<void> {
  const type = (asString(notification.type) || 'general').toLowerCase();
  if (SKIP_BELL_PUSH_TYPES.has(type)) return;
  if (!SOCIAL_PUSH_TYPES.has(type) && type !== 'general') return;

  const userId = asString(notification.user_id);
  if (!userId) return;

  const actorId = asString(notification.actor_id);
  let actorName = asString(notification.title);
  if (!actorName && actorId) {
    const actorSnap = await db.collection('profiles').doc(actorId).get();
    const actor = actorSnap.data() || {};
    actorName = asString(actor.display_name) || asString(actor.username) || 'Someone';
  }

  const title =
    asString(notification.title) ||
    (type === 'like' || type === 'comment' || type === 'follow' || type === 'friend_request'
      ? actorName || 'Someone'
      : 'VYBE');

  const defaultBodies: Record<string, string> = {
    like: 'liked your post',
    comment: 'commented on your post',
    follow: 'started following you',
    friend_request: 'sent you a friend request',
    friend_accepted: 'accepted your friend request',
    friend_declined: 'declined your friend request',
    mention: 'mentioned you',
    smart_ping: 'sent you a notification',
    announcement: 'posted an announcement',
    content_removed: 'moderation update',
    map_wave: 'waved at you on VybeMap',
    map_meetup: 'started a meetup nearby',
  };

  const body = asString(notification.body) || defaultBodies[type] || 'New activity on VYBE';
  const url = routeForNotificationDoc(notification, type);
  const postId = asString(notification.post_id);

  const prefKey = prefKeyForNotificationType(type);
  if (prefKey && !(await isPushEnabledForProfile(userId, prefKey))) return;

  await dispatchDmPushToProfile(userId, {
    title,
    body,
    url,
    tag: `vybe-${type}-${notificationId}`,
    type,
    data: {
      type,
      postId: postId || '',
      post_id: postId || '',
      path: url,
      url,
      actorId: actorId || '',
      actorName: actorName || '',
      notificationId,
    },
  });
}

/** Bell-menu social notifications → push (likes, comments, follows, friend requests). */
export const onSocialNotificationCreated = onDocumentCreated(
  { document: 'notifications/{notificationId}', region: 'us-central1', secrets: [...ONESIGNAL_SECRETS] },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    try {
      await notifySocialPush(snap.data() as Record<string, unknown>, snap.id);
    } catch (err) {
      console.error('[onSocialNotificationCreated]', err);
    }
  },
);
