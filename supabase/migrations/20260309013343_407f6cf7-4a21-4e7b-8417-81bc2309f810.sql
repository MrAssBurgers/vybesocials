-- Add Music Explorer badge
INSERT INTO public.badges (
  name, description, icon, category, priority, 
  gradient_from, gradient_to, effect, is_animated, 
  is_active, is_staff_badge, can_be_disabled, 
  unlock_requirement, unlock_threshold
)
SELECT 
  'Music Explorer', 
  'Discovered and shared new music tracks on VYBE', 
  '🎵', 
  'achievement'::badge_category, 
  45, 
  '280 85% 55%', 
  '320 80% 50%', 
  'glow', 
  true, 
  true, 
  false, 
  true, 
  'music_share', 
  1
WHERE NOT EXISTS (SELECT 1 FROM badges WHERE name = 'Music Explorer');

-- Add Music Challenges
INSERT INTO public.challenges (
  title, description, requirement_type, 
  requirement_count, reward_xp, 
  type, is_active
)
SELECT 
  'Trendsetter', 
  'Share a new music track to your feed', 
  'music_share', 
  1, 
  50, 
  'daily', 
  true
WHERE NOT EXISTS (SELECT 1 FROM challenges WHERE title = 'Trendsetter' AND requirement_type = 'music_share');