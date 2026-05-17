UPDATE public.notifications
SET deep_link = '/brief?' || substring(deep_link from 8)
WHERE deep_link LIKE '/brief&%';