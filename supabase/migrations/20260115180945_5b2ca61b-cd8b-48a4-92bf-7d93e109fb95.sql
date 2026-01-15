-- Add policy for admins and mods using user_roles table
CREATE POLICY "Mods and admins can manage meme ban backgrounds"
ON public.meme_ban_backgrounds
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role IN ('admin', 'moderator', 'owner_wife')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role IN ('admin', 'moderator', 'owner_wife')
  )
);