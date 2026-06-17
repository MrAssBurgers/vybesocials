import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { db } from './_shared/admin.js';
import { dispatchDmPushToProfile, dispatchCallPushToProfile, messagePreview } from './_shared/fcmPush.js';

function asString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return undefined;
}

async function notifyDmRecipients(message: Record<string, unknown>, messageId: string): Promise<void> {
  if (message.is_deleted === true) return;
  if (message.is_optimistic === true) return;

  const conversationId = asString(message.conversation_id);
  const senderId = asString(message.sender_id);
  if (!conversationId || !senderId) return;

  const [convSnap, senderSnap, membersSnap] = await Promise.all([
    db.collection('conversations').doc(conversationId).get(),
    db.collection('profiles').doc(senderId).get(),
    db.collection('conversation_members').where('conversation_id', '==', conversationId).get(),
  ]);

  const conversation = convSnap.data() || {};
  const sender = senderSnap.data() || {};
  const senderName = asString(sender.display_name) || asString(sender.username) || 'Someone';
  const isGroup = conversation.is_group === true;
  const title = isGroup
    ? (asString(conversation.name) || senderName)
    : senderName;
  const body = messagePreview(message);
  const type = isGroup ? 'group_message' : 'dm';
  const url = `/messages/${conversationId}`;

  const recipients = membersSnap.docs
    .map((d) => d.data())
    .filter((m) => asString(m.user_id) && m.user_id !== senderId)
    .filter((m) => m.is_muted !== true);

  await Promise.all(
    recipients.map(async (member) => {
      const recipientId = asString(member.user_id)!;
      await db.collection('notifications').add({
        user_id: recipientId,
        title,
        body,
        url,
        type,
        conversation_id: conversationId,
        sender_id: senderId,
        message_id: messageId,
        created_at: new Date().toISOString(),
        read: false,
      });

      await dispatchDmPushToProfile(recipientId, {
        title,
        body,
        url,
        tag: `vybe-dm-${conversationId}`,
        type,
        data: {
          conversationId,
          senderId,
          senderName,
          messageId,
          path: url,
        },
      });
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
      const pushResult = await dispatchCallPushToProfile(recipientId, {
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
        console.warn('[onCallCreated] no push targets for', recipientId);
      }
    }),
  );
}

/** Flat messages collection (primary DM path after Firebase migration). */
export const onDmMessageCreated = onDocumentCreated(
  { document: 'messages/{messageId}', region: 'us-central1' },
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
  { document: 'conversations/{cid}/messages/{messageId}', region: 'us-central1' },
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
  { document: 'calls/{callId}', region: 'us-central1' },
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
