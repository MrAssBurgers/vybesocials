-- Ensure typing_indicators DELETE events include full row data for realtime
ALTER TABLE public.typing_indicators REPLICA IDENTITY FULL;

-- Same for chat_presence
ALTER TABLE public.chat_presence REPLICA IDENTITY FULL;