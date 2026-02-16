
-- Drop the unique constraint on level so premium items can share level 0
ALTER TABLE public.battle_pass_tiers DROP CONSTRAINT IF EXISTS battle_pass_tiers_level_key;

-- Insert exclusive premium-only cosmetics
INSERT INTO public.battle_pass_tiers (level, reward_type, reward_name, reward_icon, reward_description, is_premium, xp_required)
VALUES
  (100, 'name_color', 'Premium Gold', '👑', 'Exclusive golden name color for Premium members', true, 0),
  (101, 'title', 'VIP', '💎', 'Exclusive VIP title badge for Premium members', true, 0),
  (102, 'effect', 'Crown Glow', '✨', 'Exclusive glowing crown effect for Premium members', true, 0),
  (103, 'cosmetic', 'Diamond Frame', '💠', 'Exclusive diamond avatar frame for Premium members', true, 0),
  (104, 'profile_theme', 'Obsidian', '🖤', 'Exclusive dark luxury profile theme for Premium members', true, 0);
