-- 1. Pin search_path on functions flagged by the linter
ALTER FUNCTION public._vybe_default_points(text) SET search_path = public;
ALTER FUNCTION public.calculate_level_from_xp(integer) SET search_path = public;
ALTER FUNCTION public.validate_battle_pass_tier() SET search_path = public;

-- 2. Enable RLS on internal demo seed log (no policies = no client access; only service role/SECURITY DEFINER can read/write)
ALTER TABLE public._demo_seed_log ENABLE ROW LEVEL SECURITY;