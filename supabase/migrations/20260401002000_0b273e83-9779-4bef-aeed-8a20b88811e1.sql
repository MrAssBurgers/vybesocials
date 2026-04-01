-- 1. CHAT-MEDIA: Make bucket private (files only accessible via authenticated policies)
UPDATE storage.buckets SET public = false WHERE id = 'chat-media';

-- 2. VYBE_DNA: Remove broad SELECT policies
DROP POLICY IF EXISTS "Users can read any DNA" ON public.vybe_dna;
DROP POLICY IF EXISTS "Users can view any DNA" ON public.vybe_dna;

-- Add owner-only SELECT
CREATE POLICY "Users can read own DNA"
  ON public.vybe_dna FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 3. USER_ROLES_AUTH: Restrict SELECT to own row
DROP POLICY IF EXISTS "Authenticated can view roles" ON public.user_roles_auth;
CREATE POLICY "Users can view own role"
  ON public.user_roles_auth FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- 4. USER_SAVED_SOUNDS: Remove broad discovery SELECT
DROP POLICY IF EXISTS "Users can view any saved sounds for discovery" ON public.user_saved_sounds;