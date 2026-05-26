INSERT INTO public.user_roles (user_id, role)
VALUES ('e78010f2-d5f1-428b-b5df-8fc6b768772d', 'owner')
ON CONFLICT (user_id, role) DO NOTHING;