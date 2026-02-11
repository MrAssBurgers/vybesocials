
-- Create a personalized feed function that filters posts by matching tags to user interests
-- Tags are mapped to interest categories using keyword matching
CREATE OR REPLACE FUNCTION public.get_personalized_feed(
  p_user_id uuid,
  p_interests text[] DEFAULT NULL,
  p_type text DEFAULT NULL,
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 15
)
RETURNS TABLE(
  id uuid,
  type text,
  media_url text,
  media_urls text[],
  thumbnail_url text,
  caption text,
  tags text[],
  created_at timestamp with time zone,
  is_pinned boolean,
  view_count integer,
  author_id uuid,
  author_username text,
  author_avatar_url text,
  like_count bigint,
  comment_count bigint,
  is_liked boolean,
  is_bookmarked boolean,
  relevance_score float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH tag_category_map AS (
    -- Map tags to interest categories using keyword matching
    SELECT unnest AS tag, 
      CASE
        WHEN unnest IN ('comedy','funny','memes','humor','joke','jokes','lol','lmao') THEN ARRAY['comedy']
        WHEN unnest IN ('music','song','songs','singing','rapper','rap','hiphop','rnb','rock','pop','jazz','edm','beats','producer','dj') THEN ARRAY['music']
        WHEN unnest IN ('dance','dancing','choreography','ballet','hiphop','breakdance','twerk') THEN ARRAY['dance','music']
        WHEN unnest IN ('gaming','gamer','esports','twitch','xbox','playstation','nintendo','pc','valorant','fortnite','minecraft','roblox','cod') THEN ARRAY['gaming']
        WHEN unnest IN ('sports','football','soccer','basketball','nba','nfl','baseball','tennis','golf','boxing','mma','ufc','cricket','rugby','volleyball','swimming') THEN ARRAY['sports']
        WHEN unnest IN ('food','cooking','recipe','recipes','chef','baking','foodie','restaurant','vegan','vegetarian','bbq','sushi','pizza','ramen') THEN ARRAY['food']
        WHEN unnest IN ('travel','traveling','travelling','vacation','adventure','explore','wanderlust','backpacking','roadtrip','flight','hotel','tourism','beach','mountain') THEN ARRAY['travel']
        WHEN unnest IN ('fashion','outfit','outfits','style','streetwear','designer','clothing','drip','sneakers','shoes','accessories','model','modeling') THEN ARRAY['fashion']
        WHEN unnest IN ('beauty','makeup','skincare','cosmetics','nails','hair','hairstyle','glow','tutorial','routine') THEN ARRAY['beauty']
        WHEN unnest IN ('art','drawing','painting','sketch','illustration','design','creative','digital','photography','photo','photographer','graffiti','sculpture') THEN ARRAY['art']
        WHEN unnest IN ('tech','technology','coding','programming','software','ai','machinelearning','startup','gadgets','apple','android','developer','web','data','crypto','blockchain','nft') THEN ARRAY['tech']
        WHEN unnest IN ('fitness','gym','workout','exercise','bodybuilding','crossfit','yoga','running','marathon','health','muscle','gains','training','cardio') THEN ARRAY['fitness']
        WHEN unnest IN ('animals','pets','dog','dogs','cat','cats','puppy','kitten','wildlife','birds','fish','aquarium','horse','horses','cute') THEN ARRAY['animals']
        WHEN unnest IN ('nature','outdoors','hiking','camping','garden','gardening','plants','flowers','landscape','sunset','sunrise','ocean','forest','mountain') THEN ARRAY['nature']
        WHEN unnest IN ('movies','film','cinema','hollywood','netflix','streaming','tv','tvshow','series','anime','marvel','starwars','horror','thriller','documentary') THEN ARRAY['movies']
        WHEN unnest IN ('books','reading','book','novel','fiction','nonfiction','poetry','writing','writer','author','literature','library','bookworm','booktok') THEN ARRAY['books']
        WHEN unnest IN ('diy','crafts','craft','handmade','woodworking','sewing','knitting','renovation','homeimprovement','build','maker') THEN ARRAY['diy']
        WHEN unnest IN ('science','physics','chemistry','biology','space','nasa','astronomy','research','experiment','math','engineering','robotics') THEN ARRAY['science']
        WHEN unnest IN ('news','politics','breaking','current','events','world','journalism','media','opinion','debate') THEN ARRAY['news']
        WHEN unnest IN ('education','learning','study','studying','school','college','university','tutorial','howto','tips','advice','motivation','mindset','productivity') THEN ARRAY['education']
        ELSE ARRAY[unnest] -- Custom tags map to themselves
      END AS categories
    FROM unnest(COALESCE(p_interests, ARRAY[]::text[]))
  ),
  -- Flatten all interest categories the user cares about
  user_categories AS (
    SELECT DISTINCT unnest(categories) AS category FROM tag_category_map
    UNION
    SELECT unnest(COALESCE(p_interests, ARRAY[]::text[]))
  ),
  post_base AS (
    SELECT 
      p.id, p.type, p.media_url, COALESCE(p.media_urls, ARRAY[]::text[]) as media_urls, 
      p.thumbnail_url, p.caption, p.tags, p.created_at,
      COALESCE(p.is_pinned, false) as is_pinned, 
      COALESCE(p.view_count, 0) as view_count, 
      p.author_id,
      -- Calculate relevance: how many of the post's tags match user interests
      (
        SELECT COUNT(DISTINCT uc.category)::float 
        FROM unnest(COALESCE(p.tags, ARRAY[]::text[])) AS pt(tag)
        CROSS JOIN LATERAL (
          SELECT CASE
            WHEN pt.tag IN ('comedy','funny','memes','humor','joke','jokes','lol','lmao') THEN ARRAY['comedy']
            WHEN pt.tag IN ('music','song','songs','singing','rapper','rap','hiphop','rnb','rock','pop','jazz','edm','beats','producer','dj') THEN ARRAY['music']
            WHEN pt.tag IN ('dance','dancing','choreography','ballet','breakdance','twerk') THEN ARRAY['dance','music']
            WHEN pt.tag IN ('gaming','gamer','esports','twitch','xbox','playstation','nintendo','pc','valorant','fortnite','minecraft','roblox','cod') THEN ARRAY['gaming']
            WHEN pt.tag IN ('sports','football','soccer','basketball','nba','nfl','baseball','tennis','golf','boxing','mma','ufc','cricket','rugby','volleyball','swimming') THEN ARRAY['sports']
            WHEN pt.tag IN ('food','cooking','recipe','recipes','chef','baking','foodie','restaurant','vegan','vegetarian','bbq','sushi','pizza','ramen') THEN ARRAY['food']
            WHEN pt.tag IN ('travel','traveling','travelling','vacation','adventure','explore','wanderlust','backpacking','roadtrip','flight','hotel','tourism','beach','mountain') THEN ARRAY['travel']
            WHEN pt.tag IN ('fashion','outfit','outfits','style','streetwear','designer','clothing','drip','sneakers','shoes','accessories','model','modeling') THEN ARRAY['fashion']
            WHEN pt.tag IN ('beauty','makeup','skincare','cosmetics','nails','hair','hairstyle','glow','tutorial','routine') THEN ARRAY['beauty']
            WHEN pt.tag IN ('art','drawing','painting','sketch','illustration','design','creative','digital','photography','photo','photographer','graffiti','sculpture') THEN ARRAY['art']
            WHEN pt.tag IN ('tech','technology','coding','programming','software','ai','machinelearning','startup','gadgets','apple','android','developer','web','data','crypto','blockchain','nft') THEN ARRAY['tech']
            WHEN pt.tag IN ('fitness','gym','workout','exercise','bodybuilding','crossfit','yoga','running','marathon','health','muscle','gains','training','cardio') THEN ARRAY['fitness']
            WHEN pt.tag IN ('animals','pets','dog','dogs','cat','cats','puppy','kitten','wildlife','birds','fish','aquarium','horse','horses','cute') THEN ARRAY['animals']
            WHEN pt.tag IN ('nature','outdoors','hiking','camping','garden','gardening','plants','flowers','landscape','sunset','sunrise','ocean','forest','mountain') THEN ARRAY['nature']
            WHEN pt.tag IN ('movies','film','cinema','hollywood','netflix','streaming','tv','tvshow','series','anime','marvel','starwars','horror','thriller','documentary') THEN ARRAY['movies']
            WHEN pt.tag IN ('books','reading','book','novel','fiction','nonfiction','poetry','writing','writer','author','literature','library','bookworm','booktok') THEN ARRAY['books']
            WHEN pt.tag IN ('diy','crafts','craft','handmade','woodworking','sewing','knitting','renovation','homeimprovement','build','maker') THEN ARRAY['diy']
            WHEN pt.tag IN ('science','physics','chemistry','biology','space','nasa','astronomy','research','experiment','math','engineering','robotics') THEN ARRAY['science']
            WHEN pt.tag IN ('news','politics','breaking','current','events','world','journalism','media','opinion','debate') THEN ARRAY['news']
            WHEN pt.tag IN ('education','learning','study','studying','school','college','university','tutorial','howto','tips','advice','motivation','mindset','productivity') THEN ARRAY['education']
            ELSE ARRAY[pt.tag]
          END AS mapped_cats
        ) AS mapped(mapped_cats)
        JOIN user_categories uc ON uc.category = ANY(mapped.mapped_cats)
      ) AS tag_match_score
    FROM posts p
    WHERE (p_type IS NULL OR p.type = p_type)
      AND p.author_id != COALESCE(p_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
      -- Only include posts that have at least one tag matching user interests
      AND EXISTS (
        SELECT 1 FROM unnest(COALESCE(p.tags, ARRAY[]::text[])) AS pt2(tag2)
        CROSS JOIN LATERAL (
          SELECT CASE
            WHEN pt2.tag2 IN ('comedy','funny','memes','humor','joke','jokes','lol','lmao') THEN ARRAY['comedy']
            WHEN pt2.tag2 IN ('music','song','songs','singing','rapper','rap','hiphop') THEN ARRAY['music']
            WHEN pt2.tag2 IN ('dance','dancing','choreography') THEN ARRAY['dance','music']
            WHEN pt2.tag2 IN ('gaming','gamer','esports','twitch','xbox','playstation','nintendo','pc','valorant','fortnite','minecraft','roblox','cod') THEN ARRAY['gaming']
            WHEN pt2.tag2 IN ('sports','football','soccer','basketball','nba','nfl','baseball','tennis') THEN ARRAY['sports']
            WHEN pt2.tag2 IN ('food','cooking','recipe','recipes','chef','baking','foodie','restaurant') THEN ARRAY['food']
            WHEN pt2.tag2 IN ('travel','traveling','travelling','vacation','adventure','explore','wanderlust') THEN ARRAY['travel']
            WHEN pt2.tag2 IN ('fashion','outfit','outfits','style','streetwear','designer','clothing','drip','sneakers') THEN ARRAY['fashion']
            WHEN pt2.tag2 IN ('beauty','makeup','skincare','cosmetics','nails','hair','hairstyle') THEN ARRAY['beauty']
            WHEN pt2.tag2 IN ('art','drawing','painting','sketch','illustration','design','creative','digital','photography','photo','photographer') THEN ARRAY['art']
            WHEN pt2.tag2 IN ('tech','technology','coding','programming','software','ai','machinelearning','startup','gadgets') THEN ARRAY['tech']
            WHEN pt2.tag2 IN ('fitness','gym','workout','exercise','bodybuilding','crossfit','yoga','running') THEN ARRAY['fitness']
            WHEN pt2.tag2 IN ('animals','pets','dog','dogs','cat','cats','puppy','kitten','wildlife') THEN ARRAY['animals']
            WHEN pt2.tag2 IN ('nature','outdoors','hiking','camping','garden','gardening','plants','flowers') THEN ARRAY['nature']
            WHEN pt2.tag2 IN ('movies','film','cinema','hollywood','netflix','streaming','tv','tvshow','series','anime') THEN ARRAY['movies']
            WHEN pt2.tag2 IN ('books','reading','book','novel','fiction','nonfiction','poetry','writing','writer') THEN ARRAY['books']
            WHEN pt2.tag2 IN ('diy','crafts','craft','handmade','woodworking','sewing','knitting') THEN ARRAY['diy']
            WHEN pt2.tag2 IN ('science','physics','chemistry','biology','space','nasa','astronomy') THEN ARRAY['science']
            WHEN pt2.tag2 IN ('news','politics','breaking','current','events','world') THEN ARRAY['news']
            WHEN pt2.tag2 IN ('education','learning','study','studying','school','college','university','tutorial','howto') THEN ARRAY['education']
            ELSE ARRAY[pt2.tag2]
          END AS mapped_cats2
        ) AS mapped2(mapped_cats2)
        WHERE mapped2.mapped_cats2 && (SELECT array_agg(category) FROM user_categories)
      )
  ),
  like_counts AS (
    SELECT l.post_id, COUNT(*) as cnt FROM likes l WHERE l.post_id IN (SELECT pb.id FROM post_base pb) GROUP BY l.post_id
  ),
  comment_counts AS (
    SELECT c.post_id, COUNT(*) as cnt FROM comments c WHERE c.post_id IN (SELECT pb.id FROM post_base pb) GROUP BY c.post_id
  ),
  user_likes AS (
    SELECT l.post_id FROM likes l WHERE p_user_id IS NOT NULL AND l.user_id = p_user_id AND l.post_id IN (SELECT pb.id FROM post_base pb)
  ),
  user_bookmarks AS (
    SELECT b.post_id FROM bookmarks b WHERE p_user_id IS NOT NULL AND b.user_id = p_user_id AND b.post_id IN (SELECT pb.id FROM post_base pb)
  )
  SELECT pb.id, pb.type, pb.media_url, pb.media_urls, pb.thumbnail_url, pb.caption, pb.tags, pb.created_at, pb.is_pinned, pb.view_count::integer,
    pr.id as author_id, pr.username as author_username, pr.avatar_url as author_avatar_url,
    COALESCE(lc.cnt, 0) as like_count, COALESCE(cc.cnt, 0) as comment_count,
    EXISTS(SELECT 1 FROM user_likes ul WHERE ul.post_id = pb.id) as is_liked,
    EXISTS(SELECT 1 FROM user_bookmarks ub WHERE ub.post_id = pb.id) as is_bookmarked,
    -- Relevance = tag matches + recency boost + engagement boost
    (pb.tag_match_score * 10.0 + 
     GREATEST(0, 7.0 - EXTRACT(EPOCH FROM (now() - pb.created_at)) / 86400.0) + 
     LN(GREATEST(1, COALESCE(lc.cnt, 0) + COALESCE(cc.cnt, 0) * 2 + pb.view_count * 0.01))
    )::float as relevance_score
  FROM post_base pb
  JOIN profiles pr ON pb.author_id = pr.id
  LEFT JOIN like_counts lc ON lc.post_id = pb.id
  LEFT JOIN comment_counts cc ON cc.post_id = pb.id
  ORDER BY pb.is_pinned DESC, relevance_score DESC, pb.created_at DESC
  OFFSET p_offset LIMIT p_limit;
END;
$function$;
