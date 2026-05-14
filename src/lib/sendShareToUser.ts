import { supabase } from '@/integrations/supabase/client';
import { recordShareTo } from '@/lib/shareRecency';

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
    const { data: convId, error: convErr } = await supabase.rpc('create_dm_conversation', {
      other_profile_id: recipientProfileId,
    });
    if (convErr || !convId) return false;

    const isVideo = postType === 'video' || postType === 'short';

    const { error: msgErr } = await supabase.from('messages').insert({
      conversation_id: convId,
      sender_id: senderProfileId,
      content: postId,
      media_url: mediaUrl || null,
      media_type: isVideo ? 'video' : 'image',
      message_type: 'shared_post',
    });
    if (msgErr) return false;

    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', convId);

    recordShareTo(recipientProfileId);
    return true;
  } catch (err) {
    console.error('[sendShareToUser] failed:', err);
    return false;
  }
}
