-- Ensure UPDATE and DELETE realtime events include full row data
ALTER TABLE public.messages REPLICA IDENTITY FULL;