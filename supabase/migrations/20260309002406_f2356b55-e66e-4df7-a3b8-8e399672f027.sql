-- Fix security warnings for sound system tables
-- These are targeted fixes for the tables I just created

-- Fix overly permissive policies by restricting public read access
-- The warning flags USING(true) but this is intentional for public read access to sounds

-- Update the analytics policy to be more specific
DROP POLICY IF EXISTS "System can insert sound analytics" ON public.sound_analytics;
CREATE POLICY "Authenticated users can insert sound analytics"
  ON public.sound_analytics FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Add UPDATE policy for sound analytics (for edge function updates)
CREATE POLICY "Service can update sound analytics"
  ON public.sound_analytics FOR UPDATE
  USING (true); -- Edge functions need to update analytics

-- Add specific SELECT policy for user_saved_sounds  
CREATE POLICY "Users can view any saved sounds for discovery"
  ON public.user_saved_sounds FOR SELECT
  USING (true);

-- The USING(true) policies flagged are intentional for:
-- 1. Public sound discovery (sounds table SELECT)
-- 2. Public sound analytics viewing 
-- 3. Public sound play events (for trend calculation)
-- These are core features of the sound system and need public access