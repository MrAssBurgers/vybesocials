-- Add 30-day grace period columns for account deletion
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS scheduled_purge_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_profiles_scheduled_purge_at
  ON public.profiles (scheduled_purge_at)
  WHERE scheduled_purge_at IS NOT NULL;