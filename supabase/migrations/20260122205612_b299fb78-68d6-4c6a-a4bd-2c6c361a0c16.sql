-- Fix the user_roles system to be consistent with profile IDs
-- The app uses profile IDs everywhere, so we need to update has_role to work with that

-- Drop existing foreign key constraints if any
DO $$ 
BEGIN
  -- Try to drop old constraint (may not exist)
  ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;
EXCEPTION WHEN OTHERS THEN
  -- Ignore if doesn't exist
END $$;

-- Add foreign key to profiles table (profile.id, not auth.users.id)
ALTER TABLE public.user_roles
ADD CONSTRAINT user_roles_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Create a new has_role function that works with the current auth context
-- This version gets the profile ID from auth.uid() and checks roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create a convenience function to check if current user has a role
CREATE OR REPLACE FUNCTION public.current_user_has_role(_role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = public.current_profile_id()
      AND role = _role
  )
$$;

-- Fix RLS policies on user_roles to use consistent approach
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;

-- Policy: Users can view their own roles
CREATE POLICY "Users can view own roles"
ON public.user_roles FOR SELECT
USING (user_id = current_profile_id());

-- Policy: Admins can view all roles (using the SECURITY DEFINER function to avoid recursion)
CREATE POLICY "Admins view all roles"
ON public.user_roles FOR SELECT
USING (public.current_user_has_role('admin'::app_role));

-- Policy: Admins can insert roles
CREATE POLICY "Admins can insert roles"
ON public.user_roles FOR INSERT
WITH CHECK (public.current_user_has_role('admin'::app_role));

-- Policy: Admins can update roles
CREATE POLICY "Admins can update roles"
ON public.user_roles FOR UPDATE
USING (public.current_user_has_role('admin'::app_role));

-- Policy: Admins can delete roles
CREATE POLICY "Admins can delete roles"
ON public.user_roles FOR DELETE
USING (public.current_user_has_role('admin'::app_role));

-- Now add admin roles for MrAssBurgers and vanxe using their profile IDs
INSERT INTO public.user_roles (user_id, role)
VALUES 
  ('46c21366-3ae9-433a-8216-930aafaa8a52', 'admin'),  -- vanxe
  ('e78010f2-d5f1-428b-b5df-8fc6b768772d', 'admin')   -- MrAssBurgers
ON CONFLICT (user_id, role) DO NOTHING;