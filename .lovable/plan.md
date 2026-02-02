
# Fix Posts Not Loading - Filter Old Project URLs

## Problem Identified

The database contains **55 posts total**, but:
- **Only 5 posts** have valid media URLs from the current Supabase project (`eabvbtkxdbttjpdpbmuw`)
- **50 posts** have broken media URLs from an old migrated project (`szthqtnbepupjqjxaduu`)

The old project's storage no longer exists, so those URLs return 404 errors. The RPC function fetches these posts, but their images/videos fail to load, resulting in empty cards or fallback gradients appearing in the feed.

## Solution

Filter out posts with old/invalid media URLs **at the database level** using the RPC function. This ensures:
1. Only posts with valid, loadable media are returned
2. No wasted network requests for broken URLs
3. Feed shows only real, viewable content

## Implementation

### File: Create a new SQL migration

Update both `get_posts_with_counts` and `get_following_posts_with_counts` RPC functions to add a filter clause that only includes posts where `media_url` contains the current project ID.

**Add to WHERE clause:**
```sql
AND p.media_url LIKE '%eabvbtkxdbttjpdpbmuw%'
```

This filters at the source, preventing broken posts from ever being returned.

### Alternative: Client-Side Filter (Backup)

If database migration is too disruptive, we can add a client-side filter in `useInfinitePosts.ts`:

```typescript
const CURRENT_PROJECT = 'eabvbtkxdbttjpdpbmuw';

function isValidProjectMedia(url: string): boolean {
  return url.includes(CURRENT_PROJECT);
}

// Filter posts after transform
const validPosts = posts.filter(p => isValidProjectMedia(p.media_url));
```

## Recommended Approach: Database Filter

The database-level filter is preferred because:
1. Reduces data transfer (fewer rows returned)
2. Pagination works correctly (won't have gaps)
3. Count calculations are accurate
4. Better performance

## Technical Details

### Migration SQL
```sql
-- Update get_posts_with_counts to filter valid media URLs
CREATE OR REPLACE FUNCTION public.get_posts_with_counts(...)
RETURNS TABLE(...)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH post_base AS (
    SELECT ...
    FROM posts p
    WHERE 
      (p_type IS NULL OR p.type = p_type)
      AND (p_author_id IS NULL OR p.author_id = p_author_id)
      AND p.media_url IS NOT NULL
      AND p.media_url != ''
      -- NEW: Only include current project media
      AND p.media_url LIKE '%eabvbtkxdbttjpdpbmuw%'
    ...
  )
  ...
END;
$$;
```

## Files to Modify

| File | Change |
|------|--------|
| `supabase/migrations/[new].sql` | Update RPC functions to filter old project URLs |

## Expected Result

- Feed will show only the 2 valid posts (type=post) and 3 shorts
- No empty/broken cards in the feed
- Users will see actual content that loads properly
- Performance improvement from reduced data transfer
