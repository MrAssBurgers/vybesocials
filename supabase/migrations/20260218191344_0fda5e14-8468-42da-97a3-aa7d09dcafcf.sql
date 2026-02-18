-- Add unique constraint on redeemer_id alone so each user can only redeem ONE invite ever
ALTER TABLE public.invite_redemptions 
ADD CONSTRAINT invite_redemptions_redeemer_id_unique UNIQUE (redeemer_id);