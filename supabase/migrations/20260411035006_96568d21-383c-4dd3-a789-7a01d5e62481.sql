
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS last_login_date date,
  ADD COLUMN IF NOT EXISTS login_streak integer DEFAULT 0;
