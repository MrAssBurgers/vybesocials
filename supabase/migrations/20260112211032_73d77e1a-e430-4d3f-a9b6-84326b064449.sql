-- Add owner_wife to the app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'owner_wife';