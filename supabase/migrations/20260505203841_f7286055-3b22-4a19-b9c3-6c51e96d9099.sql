
CREATE TYPE public.dna_agent_intensity AS ENUM ('gentle','balanced','bold');

ALTER TABLE public.dna_agent_settings
  ADD COLUMN trigger_on_post boolean NOT NULL DEFAULT true,
  ADD COLUMN trigger_on_follow boolean NOT NULL DEFAULT true,
  ADD COLUMN trigger_on_session boolean NOT NULL DEFAULT true,
  ADD COLUMN max_intensity public.dna_agent_intensity NOT NULL DEFAULT 'balanced',
  ADD COLUMN learning_paused boolean NOT NULL DEFAULT false,
  ADD COLUMN personalization_opted_out boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.clear_dna_adaptation_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  DELETE FROM public.dna_auto_theme WHERE user_id = uid;
  DELETE FROM public.dna_agent_actions WHERE user_id = uid;
  UPDATE public.dna_content_preferences
     SET boost_topics = '{}', reduce_topics = '{}', preferred_content_types = '{}',
         creator_affinity_overrides = '{}'::jsonb, conversation_context = '[]'::jsonb,
         discovery_level = 'balanced', updated_at = now()
   WHERE user_id = uid;
  UPDATE public.dna_agent_settings
     SET last_run_at = NULL, updated_at = now()
   WHERE user_id = uid;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_dna_adaptation_data() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_dna_adaptation_data() TO authenticated;
