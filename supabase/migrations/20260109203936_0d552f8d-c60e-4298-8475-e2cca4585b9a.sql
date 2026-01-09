-- Add unique constraint on dm_settings for upsert to work properly
ALTER TABLE public.dm_settings 
ADD CONSTRAINT dm_settings_conversation_user_unique 
UNIQUE (conversation_id, user_id);