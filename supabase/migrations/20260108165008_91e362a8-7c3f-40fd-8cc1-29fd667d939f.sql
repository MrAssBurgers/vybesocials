-- Create a function to filter profanity from text
CREATE OR REPLACE FUNCTION public.filter_profanity(input_text text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = 'public'
AS $$
DECLARE
  filtered_text text := input_text;
  bad_words text[] := ARRAY['fuck', 'shit', 'ass', 'bitch', 'damn', 'crap', 'fucking', 'shitting', 'asshole', 'bullshit'];
  word text;
BEGIN
  FOREACH word IN ARRAY bad_words LOOP
    -- Case-insensitive replacement with asterisks
    filtered_text := regexp_replace(
      filtered_text, 
      word, 
      repeat('*', length(word)), 
      'gi'
    );
  END LOOP;
  RETURN filtered_text;
END;
$$;

-- Create a trigger function to apply profanity filter on comment insert/update
CREATE OR REPLACE FUNCTION public.moderate_comment_content()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = 'public'
AS $$
BEGIN
  -- Filter profanity from the comment text
  NEW.text := public.filter_profanity(NEW.text);
  RETURN NEW;
END;
$$;

-- Create trigger to run before INSERT on comments
CREATE TRIGGER filter_comment_profanity_insert
  BEFORE INSERT ON public.comments
  FOR EACH ROW
  EXECUTE FUNCTION public.moderate_comment_content();

-- Create trigger to run before UPDATE on comments  
CREATE TRIGGER filter_comment_profanity_update
  BEFORE UPDATE ON public.comments
  FOR EACH ROW
  EXECUTE FUNCTION public.moderate_comment_content();