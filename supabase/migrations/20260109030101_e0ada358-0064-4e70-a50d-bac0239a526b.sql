-- ===========================================
-- DM FEATURES: Enhanced messaging capabilities
-- ===========================================

-- 1. DM Settings per conversation (themes, fonts, sounds, aesthetics)
CREATE TABLE public.dm_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Read Receipt Control
  read_receipt_mode TEXT NOT NULL DEFAULT 'instant' CHECK (read_receipt_mode IN ('instant', 'after_reply', 'never', 'fake')),
  -- Typing Indicator Control
  typing_mode TEXT NOT NULL DEFAULT 'normal' CHECK (typing_mode IN ('normal', 'hidden', 'always_show', 'frozen')),
  -- Aesthetics
  theme TEXT DEFAULT 'default',
  chat_font TEXT DEFAULT 'default',
  chat_sound TEXT DEFAULT 'default',
  chat_wallpaper TEXT,
  -- Emotional Pulse (optional mood indicator)
  emotional_pulse TEXT CHECK (emotional_pulse IN ('nervous', 'excited', 'calm', 'drained', NULL)),
  show_emotional_pulse BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(conversation_id, user_id)
);

-- Enable RLS
ALTER TABLE public.dm_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for dm_settings
CREATE POLICY "Users can view their own DM settings"
ON public.dm_settings FOR SELECT
USING (user_id = public.current_profile_id());

CREATE POLICY "Users can insert their own DM settings"
ON public.dm_settings FOR INSERT
WITH CHECK (user_id = public.current_profile_id());

CREATE POLICY "Users can update their own DM settings"
ON public.dm_settings FOR UPDATE
USING (user_id = public.current_profile_id());

CREATE POLICY "Users can delete their own DM settings"
ON public.dm_settings FOR DELETE
USING (user_id = public.current_profile_id());

-- 2. Memory Pins (private pins for important messages)
CREATE TABLE public.message_pins (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  label TEXT, -- e.g., "First I love you", "Inside joke"
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id)
);

-- Enable RLS
ALTER TABLE public.message_pins ENABLE ROW LEVEL SECURITY;

-- RLS Policies for message_pins
CREATE POLICY "Users can view their own message pins"
ON public.message_pins FOR SELECT
USING (user_id = public.current_profile_id());

CREATE POLICY "Users can create their own message pins"
ON public.message_pins FOR INSERT
WITH CHECK (user_id = public.current_profile_id());

CREATE POLICY "Users can update their own message pins"
ON public.message_pins FOR UPDATE
USING (user_id = public.current_profile_id());

CREATE POLICY "Users can delete their own message pins"
ON public.message_pins FOR DELETE
USING (user_id = public.current_profile_id());

-- 3. Scheduled Messages (write now, send later)
CREATE TABLE public.scheduled_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT,
  media_url TEXT,
  media_type TEXT,
  view_mode TEXT DEFAULT 'permanent',
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'cancelled')),
  reply_to_id UUID REFERENCES public.messages(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for scheduled_messages
CREATE POLICY "Users can view their own scheduled messages"
ON public.scheduled_messages FOR SELECT
USING (sender_id = public.current_profile_id());

CREATE POLICY "Users can create their own scheduled messages"
ON public.scheduled_messages FOR INSERT
WITH CHECK (sender_id = public.current_profile_id());

CREATE POLICY "Users can update their own scheduled messages"
ON public.scheduled_messages FOR UPDATE
USING (sender_id = public.current_profile_id());

CREATE POLICY "Users can delete their own scheduled messages"
ON public.scheduled_messages FOR DELETE
USING (sender_id = public.current_profile_id());

-- 4. Vanish Threads (ephemeral sub-conversations)
CREATE TABLE public.vanish_threads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.vanish_threads ENABLE ROW LEVEL SECURITY;

-- RLS Policies for vanish_threads
CREATE POLICY "Conversation members can view vanish threads"
ON public.vanish_threads FOR SELECT
USING (public.is_member_of_conversation(conversation_id));

CREATE POLICY "Conversation members can create vanish threads"
ON public.vanish_threads FOR INSERT
WITH CHECK (public.is_member_of_conversation(conversation_id) AND created_by = public.current_profile_id());

CREATE POLICY "Thread creators can delete their vanish threads"
ON public.vanish_threads FOR DELETE
USING (created_by = public.current_profile_id());

-- 5. Vanish Thread Messages
CREATE TABLE public.vanish_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES public.vanish_threads(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT,
  media_url TEXT,
  media_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.vanish_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for vanish_messages
CREATE POLICY "Users can view vanish messages in their threads"
ON public.vanish_messages FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.vanish_threads vt 
  WHERE vt.id = thread_id 
  AND public.is_member_of_conversation(vt.conversation_id)
));

CREATE POLICY "Users can send vanish messages to their threads"
ON public.vanish_messages FOR INSERT
WITH CHECK (
  sender_id = public.current_profile_id() 
  AND EXISTS (
    SELECT 1 FROM public.vanish_threads vt 
    WHERE vt.id = thread_id 
    AND public.is_member_of_conversation(vt.conversation_id)
  )
);

-- 6. Add extended undo support - soft delete with undo window
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS can_undo_until TIMESTAMP WITH TIME ZONE;

-- 7. Add hybrid message support (text + voice segments)
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS voice_segments JSONB;
-- Format: [{ start: 0, end: 50, type: 'text' }, { start: 50, end: 100, type: 'voice', url: '...' }]

-- 8. Word-level reactions
CREATE TABLE public.word_reactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  word_start INTEGER NOT NULL, -- Character position start
  word_end INTEGER NOT NULL,   -- Character position end
  emoji TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id, word_start, word_end)
);

-- Enable RLS
ALTER TABLE public.word_reactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for word_reactions
CREATE POLICY "Users can view word reactions in their conversations"
ON public.word_reactions FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.messages m 
  WHERE m.id = message_id 
  AND public.is_member_of_conversation(m.conversation_id)
));

CREATE POLICY "Users can add word reactions"
ON public.word_reactions FOR INSERT
WITH CHECK (
  user_id = public.current_profile_id()
  AND EXISTS (
    SELECT 1 FROM public.messages m 
    WHERE m.id = message_id 
    AND public.is_member_of_conversation(m.conversation_id)
  )
);

CREATE POLICY "Users can delete their own word reactions"
ON public.word_reactions FOR DELETE
USING (user_id = public.current_profile_id());

-- 9. Enhanced one-time peek tracking
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS blur_on_screenshot BOOLEAN DEFAULT false;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS auto_delete_if_ignored BOOLEAN DEFAULT false;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS ignore_deadline TIMESTAMP WITH TIME ZONE;

-- 10. Enable realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_settings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.vanish_threads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.vanish_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.scheduled_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.word_reactions;