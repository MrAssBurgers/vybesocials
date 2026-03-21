
-- Drop the auth.users reference and re-reference to profiles.id instead
ALTER TABLE public.encryption_keys DROP CONSTRAINT encryption_keys_user_id_fkey;
ALTER TABLE public.encryption_keys ADD CONSTRAINT encryption_keys_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Update RLS policies to use profile id pattern
DROP POLICY IF EXISTS "Users can insert own key" ON public.encryption_keys;
DROP POLICY IF EXISTS "Users can update own key" ON public.encryption_keys;

-- Recreate using a subquery to map auth.uid() → profile.id
CREATE POLICY "Users can insert own key"
  ON public.encryption_keys FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1));

CREATE POLICY "Users can update own key"
  ON public.encryption_keys FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1))
  WITH CHECK (user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1));
