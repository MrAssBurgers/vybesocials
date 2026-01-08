-- Update the profanity filter function with comprehensive word list
CREATE OR REPLACE FUNCTION public.filter_profanity(input_text text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
DECLARE
  filtered_text text := input_text;
  bad_words text[] := ARRAY[
    -- Common profanity
    'fuck', 'fucking', 'fucked', 'fucker', 'fucks',
    'shit', 'shitting', 'shitty',
    'ass', 'asshole', 'asses',
    'bitch', 'bitches', 'bitching',
    'damn', 'damned', 'dammit',
    'crap', 'crappy',
    'bastard', 'bastards',
    'cunt', 'cunts',
    'dick', 'dicks',
    'piss', 'pissed', 'pissing',
    'whore', 'whores',
    'slut', 'sluts',
    'bullshit',
    -- Racial slurs
    'nigger', 'nigga', 'niggers', 'niggas',
    'chink', 'chinks',
    'spic', 'spics',
    'kike', 'kikes',
    'wetback', 'wetbacks',
    'gook', 'gooks',
    'beaner', 'beaners',
    -- Homophobic/transphobic slurs
    'faggot', 'faggots', 'fag', 'fags',
    'dyke', 'dykes',
    'tranny', 'trannies',
    -- Ableist slurs
    'retard', 'retards', 'retarded'
  ];
  word text;
BEGIN
  FOREACH word IN ARRAY bad_words LOOP
    -- Case-insensitive replacement with asterisks
    filtered_text := regexp_replace(
      filtered_text, 
      '\m' || word || '\M',  -- \m and \M are word boundaries in Postgres regex
      repeat('*', length(word)), 
      'gi'
    );
  END LOOP;
  RETURN filtered_text;
END;
$function$;