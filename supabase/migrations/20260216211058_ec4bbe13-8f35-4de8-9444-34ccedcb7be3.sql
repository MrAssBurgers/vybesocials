
-- Create growth_config table
CREATE TABLE public.growth_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.growth_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read growth config" ON public.growth_config FOR SELECT USING (true);
CREATE POLICY "Only admins can modify growth config" ON public.growth_config FOR ALL USING (public.is_admin(auth.uid()));

-- Seed founding config
INSERT INTO public.growth_config (key, value)
SELECT 'founding_program', jsonb_build_object('badge_id', b.id::text, 'max_slots', 500, 'is_active', true)
FROM badges b WHERE b.name = 'Founding Member';

-- Auto-grant founding badge trigger function
CREATE OR REPLACE FUNCTION public.auto_grant_founding_badge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_config JSONB;
  v_badge_id UUID;
  v_max_slots INT;
  v_current_count INT;
  v_is_active BOOLEAN;
  v_badge_name TEXT;
BEGIN
  SELECT value INTO v_config FROM growth_config WHERE key = 'founding_program';
  IF v_config IS NULL THEN RETURN NEW; END IF;
  
  v_badge_id := (v_config->>'badge_id')::UUID;
  v_max_slots := (v_config->>'max_slots')::INT;
  v_is_active := (v_config->>'is_active')::BOOLEAN;
  
  IF NOT v_is_active THEN RETURN NEW; END IF;
  
  SELECT name INTO v_badge_name FROM badges WHERE id = v_badge_id;
  SELECT COUNT(*) INTO v_current_count FROM user_badges WHERE badge_id = v_badge_id;
  
  IF v_current_count < v_max_slots THEN
    INSERT INTO user_badges (user_id, badge_id, badge_type, badge_name)
    VALUES (NEW.user_id, v_badge_id, 'special', COALESCE(v_badge_name, 'Founding Member'))
    ON CONFLICT (user_id, badge_id) DO NOTHING;
  END IF;
  
  IF v_current_count + 1 >= v_max_slots THEN
    UPDATE growth_config SET value = value || '{"is_active": false}'::jsonb, updated_at = now()
    WHERE key = 'founding_program';
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_founding_badge ON profiles;
CREATE TRIGGER trg_auto_founding_badge AFTER INSERT ON profiles FOR EACH ROW EXECUTE FUNCTION auto_grant_founding_badge();

-- Retroactively grant to existing users
INSERT INTO user_badges (user_id, badge_id, badge_type, badge_name)
SELECT p.user_id, b.id, 'special', 'Founding Member'
FROM profiles p CROSS JOIN badges b
WHERE b.name = 'Founding Member' AND p.user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM user_badges ub WHERE ub.user_id = p.user_id AND ub.badge_id = b.id)
LIMIT 500;

-- New referral milestone badges
INSERT INTO public.badges (name, description, icon, category, priority, gradient_from, gradient_to, effect, is_animated, is_active, is_staff_badge, can_be_disabled, unlock_requirement, unlock_threshold)
SELECT 'VYBE Evangelist', 'Invited 25 friends to VYBE', '🌊', 'referral'::badge_category, 54, '200 85% 55%', '240 80% 50%', 'shimmer', true, true, false, true, 'invite', 25
WHERE NOT EXISTS (SELECT 1 FROM badges WHERE name = 'VYBE Evangelist');

INSERT INTO public.badges (name, description, icon, category, priority, gradient_from, gradient_to, effect, is_animated, is_active, is_staff_badge, can_be_disabled, unlock_requirement, unlock_threshold)
SELECT 'Growth Legend', 'Invited 50 friends — legendary status', '👑', 'referral'::badge_category, 55, '45 95% 55%', '25 90% 50%', 'pulse', true, true, false, true, 'invite', 50
WHERE NOT EXISTS (SELECT 1 FROM badges WHERE name = 'Growth Legend');

-- Feature Voting tables
CREATE TABLE public.feature_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  vote_count INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES profiles(id),
  shipped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.feature_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view feature requests" ON public.feature_requests FOR SELECT USING (true);
CREATE POLICY "Auth users can create feature requests" ON public.feature_requests FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Admins can manage feature requests" ON public.feature_requests FOR UPDATE USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can delete feature requests" ON public.feature_requests FOR DELETE USING (public.is_admin(auth.uid()));

CREATE TABLE public.feature_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_id UUID NOT NULL REFERENCES feature_requests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(feature_id, user_id)
);

ALTER TABLE public.feature_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view votes" ON public.feature_votes FOR SELECT USING (true);
CREATE POLICY "Auth users can vote" ON public.feature_votes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can remove own vote" ON public.feature_votes FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_feature_vote_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE feature_requests SET vote_count = vote_count + 1, updated_at = now() WHERE id = NEW.feature_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE feature_requests SET vote_count = GREATEST(0, vote_count - 1), updated_at = now() WHERE id = OLD.feature_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_feature_vote_count AFTER INSERT OR DELETE ON feature_votes FOR EACH ROW EXECUTE FUNCTION update_feature_vote_count();

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.feature_requests;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
