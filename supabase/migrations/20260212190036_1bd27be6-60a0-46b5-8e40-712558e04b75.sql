
-- Create the missing trigger
CREATE TRIGGER on_challenge_completed_trigger
  AFTER UPDATE ON public.challenge_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.on_challenge_completed();

-- Backfill rewards for already-completed challenges
INSERT INTO public.challenge_rewards (user_id, challenge_id, xp_amount, badge_id)
SELECT 
  public.get_auth_id_for_profile(cp.user_id),
  cp.challenge_id,
  COALESCE(c.reward_xp, 0),
  c.reward_badge_id
FROM challenge_progress cp
JOIN challenges c ON c.id = cp.challenge_id
WHERE cp.is_completed = true
  AND public.get_auth_id_for_profile(cp.user_id) IS NOT NULL
ON CONFLICT (user_id, challenge_id) DO NOTHING;
