import {
  getDocument,
  getDocuments,
  setDocument,
  updateDocument,
  where,
  orderBy,
  firestoreLimit,
  onSnapshot,
  collectionRef,
  query,
} from './firestoreDb';
import { getUserProfile } from './users';
import { updateChat } from './chats';
import type { MessageDocument } from './types';
import type { Unsubscribe } from 'firebase/firestore';

export interface MessageWithSender extends MessageDocument {
  sender?: {
    id: string;
    username: string;
    avatar_url?: string | null;
    display_name?: string | null;
  };
}

export async function getMessage(messageId: string): Promise<MessageWithSender | null> {
  const msg = await getDocument<MessageDocument>('messages', messageId);
  if (!msg) return null;
  const sender = await getUserProfile(msg.sender_id);
  return {
    ...msg,
    sender: sender ? {
      id: sender.id,
      username: sender.username,
      avatar_url: sender.avatar_url,
      display_name: sender.display_name,
    } : undefined,
  };
}

export async function listChatMessages(
  chatId: string,
  limit = 100,
): Promise<MessageWithSender[]> {
  const messages = await getDocuments<MessageDocument>('messages', [
    where('conversation_id', '==', chatId),
    orderBy('created_at', 'asc'),
    firestoreLimit(limit),
  ]);

  const senderIds = [...new Set(messages.map((m) => m.sender_id))];
  const senders = await Promise.all(senderIds.map((id) => getUserProfile(id)));
  const senderMap = new Map(senders.filter(Boolean).map((s) => [s!.id, s!]));

  return messages.map((msg) => {
    const sender = senderMap.get(msg.sender_id);
    return {
      ...msg,
      sender: sender ? {
        id: sender.id,
        username: sender.username,
        avatar_url: sender.avatar_url,
        display_name: sender.display_name,
      } : undefined,
    };
  });
}

export async function sendMessage(
  chatId: string,
  senderId: string,
  payload: Partial<MessageDocument>,
): Promise<MessageDocument> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const message: MessageDocument = {
    id,
    conversation_id: chatId,
    sender_id: senderId,
    content: payload.content ?? null,
    media_url: payload.media_url ?? null,
    media_type: payload.media_type ?? null,
    message_type: payload.message_type ?? 'text',
    view_mode: payload.view_mode ?? 'permanent',
    expires_at: payload.expires_at ?? null,
    is_deleted: false,
    reply_to_id: payload.reply_to_id ?? null,
    created_at: now,
  };

  await setDocument('messages', id, message);
  await updateChat(chatId, { updated_at: now, last_message_at: now });
  return message;
}

export async function updateMessage(
  messageId: string,
  updates: Partial<MessageDocument>,
): Promise<void> {
  await updateDocument('messages', messageId, {
    ...updates,
    is_edited: updates.content !== undefined ? true : undefined,
    edited_at: updates.content !== undefined ? new Date().toISOString() : undefined,
  });
}

export async function softDeleteMessage(messageId: string): Promise<void> {
  await updateDocument('messages', messageId, { is_deleted: true });
}

export function subscribeToChatMessages(
  chatId: string,
  onMessages: (messages: MessageDocument[]) => void,
): Unsubscribe {
  const q = query(
    collectionRef('messages'),
    where('conversation_id', '==', chatId),
    orderBy('created_at', 'asc'),
  );

  return onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as MessageDocument);
    onMessages(messages);
  });
}

export async function getUnreadCount(chatId: string, userId: string): Promise<number> {
  const member = await getDocument('conversation_members', `${chatId}_${userId}`);
  const lastRead = (member?.last_read_at as string) || '1970-01-01';

  const messages = await getDocuments<MessageDocument>('messages', [
    where('conversation_id', '==', chatId),
    where('is_deleted', '==', false),
  ]);

  return messages.filter(
    (m) => m.sender_id !== userId && m.created_at > lastRead,
  ).length;
}
