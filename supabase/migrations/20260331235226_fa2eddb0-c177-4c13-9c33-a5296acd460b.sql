-- 1. Drop the overly permissive ALL policy on vybe_tokens (SELECT-only policy already exists)
DROP POLICY IF EXISTS "Users can manage own tokens" ON public.vybe_tokens;

-- 2. Drop the INSERT policy on token_transactions (inserts should only happen via SECURITY DEFINER RPCs)
DROP POLICY IF EXISTS "Users can insert own transactions" ON public.token_transactions;