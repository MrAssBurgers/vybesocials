ALTER TABLE public.posts ADD COLUMN age_rating text NOT NULL DEFAULT 'safe';
ALTER TABLE public.posts ADD CONSTRAINT posts_age_rating_check CHECK (age_rating IN ('safe', '13+', '18+'));