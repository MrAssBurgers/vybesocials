
-- Create a challenge templates pool table for daily/weekly rotation
CREATE TABLE IF NOT EXISTS public.challenge_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK (type IN ('daily', 'weekly')),
  requirement_type TEXT NOT NULL,
  requirement_count INTEGER NOT NULL DEFAULT 1,
  reward_xp INTEGER DEFAULT 10,
  reward_badge_id UUID REFERENCES public.badges(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.challenge_templates ENABLE ROW LEVEL SECURITY;

-- Everyone can read templates
CREATE POLICY "Anyone can read challenge templates"
  ON public.challenge_templates FOR SELECT USING (true);

-- Add rotation tracking columns to challenges table
ALTER TABLE public.challenges 
  ADD COLUMN IF NOT EXISTS active_date DATE,
  ADD COLUMN IF NOT EXISTS active_week_start DATE,
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES public.challenge_templates(id);

-- Seed the daily challenge templates pool
INSERT INTO public.challenge_templates (title, description, type, requirement_type, requirement_count, reward_xp) VALUES
  ('Daily Check-in', 'Open the app today', 'daily', 'login', 1, 10),
  ('Share a Thought', 'Create a post today', 'daily', 'post', 1, 20),
  ('Spread the Love', 'Like 3 posts today', 'daily', 'like', 3, 15),
  ('Join the Convo', 'Leave 2 comments today', 'daily', 'comment', 2, 15),
  ('Make a Friend', 'Follow someone new today', 'daily', 'follow', 1, 15),
  ('Say Hello', 'Send a message today', 'daily', 'message', 1, 10),
  ('Double Post', 'Create 2 posts today', 'daily', 'post', 2, 30),
  ('Social Hour', 'Like 5 posts today', 'daily', 'like', 5, 25),
  ('Conversation Starter', 'Start a new conversation', 'daily', 'new_conversation', 1, 20),
  ('Send a VYBE', 'Send a snap to a friend', 'daily', 'snap_sent', 1, 15),
  ('Comment Spree', 'Leave 5 comments today', 'daily', 'comment', 5, 25),
  ('Triple Threat', 'Create 3 posts today', 'daily', 'post', 3, 40);

-- Seed the weekly challenge templates pool
INSERT INTO public.challenge_templates (title, description, type, requirement_type, requirement_count, reward_xp) VALUES
  ('Content Creator', 'Create 5 posts this week', 'weekly', 'post', 5, 60),
  ('Social Butterfly', 'Start 3 new conversations', 'weekly', 'new_conversation', 3, 50),
  ('Engaged', 'Leave 15 comments this week', 'weekly', 'comment', 15, 50),
  ('Popularity Contest', 'Like 20 posts this week', 'weekly', 'like', 20, 40),
  ('Network Builder', 'Follow 5 new people', 'weekly', 'follow', 5, 45),
  ('Messenger', 'Send 20 messages this week', 'weekly', 'message', 20, 40),
  ('VYBE Master', 'Send 5 snaps this week', 'weekly', 'snap_sent', 5, 50),
  ('Prolific Poster', 'Create 10 posts this week', 'weekly', 'post', 10, 100),
  ('Community Pillar', 'Leave 25 comments this week', 'weekly', 'comment', 25, 75),
  ('Invite Squad', 'Invite 2 friends this week', 'weekly', 'invite', 2, 80);

-- Create the rotation function
CREATE OR REPLACE FUNCTION public.rotate_challenges()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today DATE := CURRENT_DATE;
  week_start DATE := date_trunc('week', CURRENT_DATE)::date;
  daily_template RECORD;
  weekly_template RECORD;
  daily_count INTEGER := 0;
  weekly_count INTEGER := 0;
BEGIN
  -- === DAILY ROTATION ===
  -- Check if we already have challenges for today
  SELECT COUNT(*) INTO daily_count 
  FROM challenges 
  WHERE type = 'daily' AND active_date = today AND is_active = true;

  IF daily_count = 0 THEN
    -- Deactivate yesterday's daily challenges
    UPDATE challenges 
    SET is_active = false 
    WHERE type = 'daily' AND active_date IS NOT NULL AND active_date < today;

    -- Pick 3 random daily templates
    FOR daily_template IN 
      SELECT * FROM challenge_templates 
      WHERE type = 'daily' AND is_active = true 
      ORDER BY random() 
      LIMIT 3
    LOOP
      INSERT INTO challenges (title, description, type, requirement_type, requirement_count, reward_xp, reward_badge_id, is_active, active_date, template_id)
      VALUES (
        daily_template.title,
        daily_template.description,
        'daily',
        daily_template.requirement_type,
        daily_template.requirement_count,
        daily_template.reward_xp,
        daily_template.reward_badge_id,
        true,
        today,
        daily_template.id
      );
    END LOOP;
  END IF;

  -- === WEEKLY ROTATION ===
  -- Check if we already have challenges for this week
  SELECT COUNT(*) INTO weekly_count 
  FROM challenges 
  WHERE type = 'weekly' AND active_week_start = week_start AND is_active = true;

  IF weekly_count = 0 THEN
    -- Deactivate old weekly challenges
    UPDATE challenges 
    SET is_active = false 
    WHERE type = 'weekly' AND active_week_start IS NOT NULL AND active_week_start < week_start;

    -- Pick 3 random weekly templates
    FOR weekly_template IN 
      SELECT * FROM challenge_templates 
      WHERE type = 'weekly' AND is_active = true 
      ORDER BY random() 
      LIMIT 3
    LOOP
      INSERT INTO challenges (title, description, type, requirement_type, requirement_count, reward_xp, reward_badge_id, is_active, active_week_start, template_id)
      VALUES (
        weekly_template.title,
        weekly_template.description,
        'weekly',
        weekly_template.requirement_type,
        weekly_template.requirement_count,
        weekly_template.reward_xp,
        weekly_template.reward_badge_id,
        true,
        week_start,
        weekly_template.id
      );
    END LOOP;
  END IF;
END;
$$;

-- Mark existing static daily/weekly challenges with dates so they appear for today/this week
UPDATE challenges SET active_date = CURRENT_DATE WHERE type = 'daily' AND active_date IS NULL AND is_active = true;
UPDATE challenges SET active_week_start = date_trunc('week', CURRENT_DATE)::date WHERE type = 'weekly' AND active_week_start IS NULL AND is_active = true;

-- Run the rotation immediately to seed today's and this week's challenges
SELECT public.rotate_challenges();
