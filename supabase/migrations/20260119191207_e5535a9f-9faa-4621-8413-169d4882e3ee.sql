-- Fix RLS policy for invite_redemptions - redeemer_id is a profile ID, not auth.uid()
DROP POLICY IF EXISTS "Users can redeem invites" ON public.invite_redemptions;
DROP POLICY IF EXISTS "Users can view their own redemptions" ON public.invite_redemptions;

-- Allow users to insert redemptions where the redeemer_id matches their profile
CREATE POLICY "Users can redeem invites" ON public.invite_redemptions
FOR INSERT WITH CHECK (
  redeemer_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

-- Allow users to view their own redemptions
CREATE POLICY "Users can view their own redemptions" ON public.invite_redemptions
FOR SELECT USING (
  redeemer_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

-- Allow viewing redemptions for invites the user owns (for stats)
CREATE POLICY "Inviters can view redemptions of their invites" ON public.invite_redemptions
FOR SELECT USING (
  invite_id IN (SELECT id FROM public.invites WHERE inviter_id = auth.uid())
);

-- Add UPDATE policy for invites to allow incrementing use_count
DROP POLICY IF EXISTS "Users can update their own invites" ON public.invites;
CREATE POLICY "Users can update their own invites" ON public.invites
FOR UPDATE USING (auth.uid() = inviter_id);