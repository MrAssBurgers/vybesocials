-- Create user_warnings table for moderator warnings
CREATE TABLE public.user_warnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  warned_by uuid NOT NULL REFERENCES public.profiles(id),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create user_bans table for user bans
CREATE TABLE public.user_bans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  banned_by uuid NOT NULL REFERENCES public.profiles(id),
  reason text NOT NULL,
  is_permanent boolean NOT NULL DEFAULT false,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_warnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_bans ENABLE ROW LEVEL SECURITY;

-- RLS policies for user_warnings
CREATE POLICY "Admins and mods can view all warnings"
  ON public.user_warnings FOR SELECT
  USING (has_role(current_profile_id(), 'admin') OR has_role(current_profile_id(), 'moderator'));

CREATE POLICY "Admins and mods can create warnings"
  ON public.user_warnings FOR INSERT
  WITH CHECK (has_role(current_profile_id(), 'admin') OR has_role(current_profile_id(), 'moderator'));

CREATE POLICY "Admins can delete warnings"
  ON public.user_warnings FOR DELETE
  USING (has_role(current_profile_id(), 'admin'));

-- RLS policies for user_bans
CREATE POLICY "Admins and mods can view all bans"
  ON public.user_bans FOR SELECT
  USING (has_role(current_profile_id(), 'admin') OR has_role(current_profile_id(), 'moderator'));

CREATE POLICY "Admins and mods can create bans"
  ON public.user_bans FOR INSERT
  WITH CHECK (has_role(current_profile_id(), 'admin') OR has_role(current_profile_id(), 'moderator'));

CREATE POLICY "Admins can update bans"
  ON public.user_bans FOR UPDATE
  USING (has_role(current_profile_id(), 'admin'));

CREATE POLICY "Admins can delete bans"
  ON public.user_bans FOR DELETE
  USING (has_role(current_profile_id(), 'admin'));

-- Users can view their own warnings
CREATE POLICY "Users can view own warnings"
  ON public.user_warnings FOR SELECT
  USING (user_id = current_profile_id());

-- Users can view their own bans  
CREATE POLICY "Users can view own bans"
  ON public.user_bans FOR SELECT
  USING (user_id = current_profile_id());