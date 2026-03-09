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