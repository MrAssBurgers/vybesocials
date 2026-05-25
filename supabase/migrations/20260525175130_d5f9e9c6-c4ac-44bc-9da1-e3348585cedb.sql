ALTER TABLE public.auth_challenges DROP CONSTRAINT IF EXISTS auth_challenges_challenge_type_check;
ALTER TABLE public.auth_challenges ADD CONSTRAINT auth_challenges_challenge_type_check
  CHECK (challenge_type = ANY (ARRAY['email_2fa'::text, 'phone_2fa'::text, 'login_approval'::text, 'qr_signin'::text, 'passkey_register'::text, 'passkey_login'::text]));