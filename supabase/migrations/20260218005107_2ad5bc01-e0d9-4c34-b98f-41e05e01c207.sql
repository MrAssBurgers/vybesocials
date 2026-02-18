
-- Create a unified user_preferences table for all client-side preferences
-- This replaces scattered localStorage usage with server-persisted prefs
CREATE TABLE IF NOT EXISTS public.user_preferences (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Media preferences
  clips_muted boolean DEFAULT true,
  explore_view_mode text DEFAULT 'clips',
  -- Button/sound preferences
  button_sound text DEFAULT 'pop',
  -- Quick add dismissed users
  dismissed_quick_add_ids text[] DEFAULT '{}',
  -- Easter eggs unlocked
  unlocked_easter_eggs text[] DEFAULT '{}',
  -- Intro / one-time dialogs
  intro_completed boolean DEFAULT false,
  referral_confirmed boolean DEFAULT false,
  -- Generic JSON bag for less common prefs (future-proof)
  extra jsonb DEFAULT '{}'::jsonb,
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_preferences_user_id_key UNIQUE (user_id)
);

-- Enable RLS
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- Users can only access their own preferences
CREATE POLICY "Users can read own preferences"
  ON public.user_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences"
  ON public.user_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences"
  ON public.user_preferences FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Auto-update updated_at
CREATE TRIGGER update_user_preferences_updated_at
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
