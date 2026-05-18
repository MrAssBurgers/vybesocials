## What's broken

**1. DMs fail with `column cm.profile_id does not exist` (400)**

The `trg_vybe_on_message` trigger fires on every `INSERT INTO messages` and references `cm.profile_id` on `public.conversation_members`. That column doesn't exist — the table uses `user_id` (which stores profile ids). So every send aborts before the row is committed.

**2. Two typing indicators show at once**

In `ChatView.tsx`, when the other person is typing, two things render:
- The header `LivePresenceBar` (line ~1396) shows the "typing…" text under the username.
- The `SnapTypingBubble` (line ~1734) animates above the input.

Both feed from the same `typingUsers` array.

## Fix

**Migration — repair the trigger function**

```sql
CREATE OR REPLACE FUNCTION public.trg_vybe_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recipient uuid;
BEGIN
  PERFORM public.award_vybe_points(NEW.sender_id, 'dm_send', NULL, NEW.id);
  FOR recipient IN
    SELECT cm.user_id FROM public.conversation_members cm
      WHERE cm.conversation_id = NEW.conversation_id
        AND cm.user_id <> NEW.sender_id
  LOOP
    PERFORM public.award_vybe_points(recipient, 'dm_receive', NULL, NEW.id);
  END LOOP;
  RETURN NEW;
END $$;
```

(`conversation_members.user_id` already stores the profile id per the existing memory note, so `award_vybe_points` will receive the correct value.)

**Frontend — single typing indicator**

In `src/components/chat/ChatView.tsx`, keep the chat-bubble `SnapTypingBubble` above the input (it's the more visible, on-brand one) and stop the header `LivePresenceBar` from also flipping into "typing" mode for 1:1 DMs. Pass `isTyping={false}` to `LivePresenceBar` (or drop the typing branch inside it) so the header just shows online/in-chat status while the bubble handles the typing affordance.

No design changes, no other components touched.