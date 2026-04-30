## Bug Found: `update_trending_scores` SQL Function

The `calculate-earnings` edge function (runs every 5 minutes) is failing with:
```
column tu.sound_id does not exist
```

### Root Cause

The DB function `public.update_trending_scores()` references columns that do not exist on the actual tables:

| Reference in function | Actual column |
|---|---|
| `sounds.id` | `sounds.sound_id` (PK) |
| `track_usage.sound_id` | `track_usage.track_id` |
| `track_usage.used_at` | `track_usage.last_updated` |

`track_usage` is keyed by free-form `track_id` (text), not the `sounds.sound_id` UUID, so it can't reliably join to `sounds` anyway. The `sound_play_events` table is the correct source for "recent usage in last 24h" — it has `sound_id` (uuid) + `created_at`.

### Fix

Replace the function body to:
1. Use `sounds.sound_id` instead of `sounds.id`.
2. Pull recent usage from `sound_play_events` (correct semantic source for plays).
3. Keep the existing 1.5x boost for sounds <7 days old, weight (5x) for recent plays, and the `RETURNS jsonb` shape so the edge function still logs `sounds_updated`.

### Implementation

Single migration that recreates `public.update_trending_scores()` with the corrected column references, preserving `SECURITY DEFINER` and `SET search_path = public` (per project standards).

```sql
CREATE OR REPLACE FUNCTION public.update_trending_scores()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count INTEGER := 0;
BEGIN
  UPDATE sounds SET
    trend_score = (
      usage_count * 1.0 +
      COALESCE((
        SELECT COUNT(*) FROM sound_play_events spe
        WHERE spe.sound_id = sounds.sound_id
          AND spe.created_at > NOW() - INTERVAL '24 hours'
      ), 0) * 5.0
    ) * CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN 1.5 ELSE 1.0 END,
    updated_at = NOW()
  WHERE usage_count > 0 OR created_at > NOW() - INTERVAL '7 days';

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN jsonb_build_object('sounds_updated', updated_count, 'timestamp', NOW());
END;
$$;
```

### Other Checks Performed

- Runtime errors: none captured this session.
- Browser console / network: clean.
- Bottom nav centering: already resolved in prior turns.
- No other failing edge functions in current logs (`process-email-queue` boots cleanly).

If you want, I can also run the Supabase linter after the fix to surface any additional latent DB warnings — but no other active bug is currently visible.