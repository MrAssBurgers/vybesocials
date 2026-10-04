import { createDmChat } from '@/lib/firebase/chats';
import { repairConversationForSend } from '@/lib/dmMembershipRepair';
import { recordShareTo } from '@/lib/shareRecency';
import { bumpConversationUpdatedAt, insertDmMessage } from '@/lib/dmSendCore';

/**
 * Send a shared theme to a friend as a DM. Mirrors sendShareToUser but uses
 * message_type='shared_theme' and stores the shared_theme_id in content.
 */
export async function sendThemeToUser(params: {
  recipientProfileId: string;
  senderProfileId: string;
  sharedThemeId: string;
  clientMessageId: string;
  accountGuard: () => void;
}): Promise<boolean> {
  const { recipientProfileId, senderProfileId, sharedThemeId, clientMessageId, accountGuard } = params;
  try {
    accountGuard();
    const convId = await createDmChat(recipientProfileId);
    accountGuard();
    if (!convId) return false;
    await repairConversationForSend(convId, senderProfileId, recipientProfileId);
    accountGuard();
    const { data, error } = await insertDmMessage({
      conversation_id: convId, sender_id: senderProfileId, content: sharedThemeId,
      media_url: null, media_type: null, message_type: 'shared_theme',
      client_message_id: clientMessageId,
    }, { otherProfileId: recipientProfileId, accountGuard });
    accountGuard();
    if (error || !data?.id || data.conversation_id !== convId || data.sender_id !== senderProfileId
      || data.content !== sharedThemeId || data.message_type !== 'shared_theme'
      || (data as typeof data & { client_message_id?: string }).client_message_id !== clientMessageId) return false;
    // The callable owns conversation timestamps. An optional recency write
    // cannot turn an acknowledged message into a failed delivery.
    try { recordShareTo(recipientProfileId); } catch { /* Best effort only. */ }
    return true;
  } catch {
    return false;
  }
}



export type SharePostType = 'video' | 'short' | 'image' | 'post';

interface SendShareToUserParams {
  recipientProfileId: string;
  senderProfileId: string;
  postId: string;
  postType: SharePostType;
  mediaUrl?: string | null;
}

/**
 * Sends a single shared-post DM to a friend.
 * Creates / reuses the DM conversation, inserts the message, bumps the
 * conversation timestamp, and records the share for "top friends" ranking.
 */
export async function sendShareToUser({
  recipientProfileId,
  senderProfileId,
  postId,
  postType,
  mediaUrl,
}: SendShareToUserParams): Promise<boolean> {
  try {
    const convId = await createDmChat(recipientProfileId);
    if (!convId) return false;

    await repairConversationForSend(convId, senderProfileId, recipientProfileId);

    const isVideo = postType === 'video' || postType === 'short';

    const { error: msgErr } = await insertDmMessage(
      {
        conversation_id: convId,
        sender_id: senderProfileId,
        content: postId,
        media_url: mediaUrl || null,
        media_type: isVideo ? 'video' : 'image',
        message_type: 'shared_post',
      },
      { otherProfileId: recipientProfileId },
    );
    if (msgErr) return false;

    await bumpConversationUpdatedAt(convId);

    recordShareTo(recipientProfileId);
    return true;
  } catch (err) {
    console.error('[sendShareToUser] failed:', err);
    return false;
  }
}
