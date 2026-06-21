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
  themeName?: string;
}): Promise<boolean> {
  const { recipientProfileId, senderProfileId, sharedThemeId, themeName } = params;
  try {
    const convId = await createDmChat(recipientProfileId);
    if (!convId) return false;

    await repairConversationForSend(convId, senderProfileId, recipientProfileId);

    const { error: msgErr } = await insertDmMessage(
      {
        conversation_id: convId,
        sender_id: senderProfileId,
        content: sharedThemeId,
        media_url: themeName || null,
        media_type: 'theme',
        message_type: 'shared_theme',
      },
      { otherProfileId: recipientProfileId },
    );
    if (msgErr) return false;

    await bumpConversationUpdatedAt(convId);

    recordShareTo(recipientProfileId);
    return true;
  } catch (err) {
    console.error('[sendThemeToUser] failed:', err);
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
