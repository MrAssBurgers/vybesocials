UPDATE public.notifications
SET deep_link = regexp_replace(deep_link, '^/\?openBrief=true', '/brief')
WHERE deep_link LIKE '/?openBrief=true%';