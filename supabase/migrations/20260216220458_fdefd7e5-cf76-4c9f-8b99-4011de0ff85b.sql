
-- 1. Delete all battle_pass_tiers above level 50 (broken entries)
DELETE FROM battle_pass_tiers WHERE level > 50;

-- 2. Delete levels 51 and 52 which have incorrect low XP values
-- (Already covered by above DELETE)

-- 3. Add a validation trigger to prevent zero/negative xp_required on levels > 1
CREATE OR REPLACE FUNCTION public.validate_battle_pass_tier()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- Level 1 is allowed to have xp_required = 0
  IF NEW.level > 1 AND (NEW.xp_required IS NULL OR NEW.xp_required <= 0) THEN
    RAISE EXCEPTION 'battle_pass_tiers: level % must have xp_required > 0 (got %)', NEW.level, NEW.xp_required;
  END IF;
  
  -- Enforce max level cap of 50
  IF NEW.level > 50 THEN
    RAISE EXCEPTION 'battle_pass_tiers: level % exceeds maximum of 50', NEW.level;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_battle_pass_tier_trigger
BEFORE INSERT OR UPDATE ON public.battle_pass_tiers
FOR EACH ROW
EXECUTE FUNCTION public.validate_battle_pass_tier();

-- 4. Harden calculate_level_from_xp to cap at level 50 and ignore zero-XP tiers
CREATE OR REPLACE FUNCTION public.calculate_level_from_xp(p_xp integer)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_level INTEGER;
BEGIN
  SELECT COALESCE(MAX(level), 1) INTO v_level
  FROM public.battle_pass_tiers
  WHERE xp_required <= p_xp
    AND (level = 1 OR xp_required > 0)  -- ignore broken zero-XP entries above level 1
    AND level <= 50;                      -- hard cap

  IF v_level IS NULL OR v_level < 1 THEN
    v_level := 1;
  END IF;

  RETURN LEAST(v_level, 50);
END;
$$;

-- 5. Fix any users who got incorrect levels from broken tiers
UPDATE user_levels
SET current_level = LEAST(current_level, 50),
    updated_at = now()
WHERE current_level > 50;
