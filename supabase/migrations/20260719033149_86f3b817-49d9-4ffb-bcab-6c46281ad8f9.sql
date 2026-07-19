DROP POLICY IF EXISTS "Anyone can view theme codes" ON public.theme_codes;
CREATE POLICY "Creators can view their theme codes" ON public.theme_codes FOR SELECT USING (
  auth.uid() IN (SELECT profiles.user_id FROM profiles WHERE profiles.id = theme_codes.creator_id)
);