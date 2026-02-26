
-- Fix security definer view by setting security_invoker
ALTER VIEW public.xp_leaderboard SET (security_invoker = on);
