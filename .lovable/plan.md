
# Fix Challenges Networking and Completion Notifications

## Problem Summary
The challenges system currently has several issues preventing it from working properly:

1. **User actions are not tracked in real-time** - Creating posts, comments, starting conversations, etc. does not update challenge progress
2. **Challenge completion notifications don't appear** - The realtime subscription for rewards isn't working
3. **Progress only syncs on login** - Users have to log out and back in to see updated progress

## Solution Overview
We'll implement automatic challenge tracking using database triggers that fire when users perform actions, enable realtime for the challenge_rewards table, and ensure the notification modal appears immediately when a challenge is completed.

---

## Technical Implementation

### 1. Enable Realtime for Challenge Rewards Table
Add the `challenge_rewards` table to the realtime publication so the frontend can receive instant notifications.

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.challenge_rewards;
```

### 2. Create Database Triggers for Automatic Progress Tracking
Create triggers on the action tables (posts, comments, messages, likes, follows, etc.) that automatically update challenge progress when users perform actions.

**New database function: `increment_challenge_progress`**
```sql
CREATE OR REPLACE FUNCTION increment_challenge_progress(
  p_user_id uuid,
  p_requirement_type text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_challenge RECORD;
  v_current_count int;
  v_is_completed boolean;
BEGIN
  -- Find all active challenges matching this requirement type
  FOR v_challenge IN 
    SELECT id, requirement_count, reward_badge_id, reward_xp
    FROM challenges 
    WHERE is_active = true 
    AND requirement_type = p_requirement_type
  LOOP
    -- Get current progress
    SELECT current_count INTO v_current_count
    FROM challenge_progress
    WHERE user_id = p_user_id AND challenge_id = v_challenge.id;
    
    -- Skip if already completed
    IF v_current_count IS NOT NULL THEN
      SELECT is_completed INTO v_is_completed
      FROM challenge_progress
      WHERE user_id = p_user_id AND challenge_id = v_challenge.id;
      
      IF v_is_completed THEN
        CONTINUE;
      END IF;
    END IF;
    
    v_current_count := COALESCE(v_current_count, 0) + 1;
    v_is_completed := v_current_count >= v_challenge.requirement_count;
    
    -- Upsert progress (trigger_challenge_completed handles reward creation)
    INSERT INTO challenge_progress (user_id, challenge_id, current_count, is_completed, completed_at, updated_at)
    VALUES (
      p_user_id, 
      v_challenge.id, 
      v_current_count, 
      v_is_completed,
      CASE WHEN v_is_completed THEN now() ELSE NULL END,
      now()
    )
    ON CONFLICT (user_id, challenge_id) 
    DO UPDATE SET 
      current_count = v_current_count,
      is_completed = v_is_completed,
      completed_at = CASE WHEN v_is_completed AND challenge_progress.completed_at IS NULL THEN now() ELSE challenge_progress.completed_at END,
      updated_at = now()
    WHERE NOT challenge_progress.is_completed;
  END LOOP;
END;
$$;
```

**Triggers for each action type:**

```sql
-- Posts trigger
CREATE OR REPLACE FUNCTION on_post_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  PERFORM increment_challenge_progress(NEW.author_id, 'post');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_post_challenge
AFTER INSERT ON posts
FOR EACH ROW
EXECUTE FUNCTION on_post_created();

-- Comments trigger  
CREATE OR REPLACE FUNCTION on_comment_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  PERFORM increment_challenge_progress(NEW.user_id, 'comment');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_comment_challenge
AFTER INSERT ON comments
FOR EACH ROW
EXECUTE FUNCTION on_comment_created();

-- Messages trigger
CREATE OR REPLACE FUNCTION on_message_sent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  PERFORM increment_challenge_progress(NEW.sender_id, 'message');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_message_challenge
AFTER INSERT ON messages
FOR EACH ROW
EXECUTE FUNCTION on_message_sent();

-- Likes trigger
CREATE OR REPLACE FUNCTION on_like_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  PERFORM increment_challenge_progress(NEW.user_id, 'like');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_like_challenge
AFTER INSERT ON likes
FOR EACH ROW
EXECUTE FUNCTION on_like_created();

-- Follows trigger
CREATE OR REPLACE FUNCTION on_follow_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Follower gets credit for following someone
  PERFORM increment_challenge_progress(NEW.follower_id, 'follow');
  -- Followee gets credit for gaining a follower
  PERFORM increment_challenge_progress(NEW.following_id, 'follower');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_follow_challenge
AFTER INSERT ON follows
FOR EACH ROW
EXECUTE FUNCTION on_follow_created();

-- Conversation member trigger (for new_conversation)
CREATE OR REPLACE FUNCTION on_conversation_joined()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  PERFORM increment_challenge_progress(NEW.user_id, 'new_conversation');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_conversation_challenge
AFTER INSERT ON conversation_members
FOR EACH ROW
EXECUTE FUNCTION on_conversation_joined();

-- Referrals trigger (for invite challenges)
CREATE OR REPLACE FUNCTION on_referral_confirmed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.confirmed = true AND (OLD IS NULL OR OLD.confirmed = false) THEN
    PERFORM increment_challenge_progress(NEW.referrer_id, 'invite');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_referral_challenge
AFTER INSERT OR UPDATE ON referrals
FOR EACH ROW
EXECUTE FUNCTION on_referral_confirmed();
```

### 3. Add Realtime Subscription for Challenge Progress Updates
Update the frontend to also subscribe to `challenge_progress` updates for real-time UI updates.

**File: `src/hooks/useBattlePass.ts`**
Add a new hook to subscribe to progress changes:

```typescript
export function useRealtimeChallengeProgress() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!profile) return;

    const channel = supabase
      .channel(`challenge-progress-${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'challenge_progress',
          filter: `user_id=eq.${profile.id}`,
        },
        (payload) => {
          // Invalidate queries to refresh UI
          queryClient.invalidateQueries({ queryKey: ['challenge-progress', profile.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id, queryClient]);
}
```

### 4. Enable Realtime for challenge_progress Table
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.challenge_progress;
```

### 5. Update RewardNotificationProvider
Ensure the reward notification modal has better error handling and add the progress subscription.

**File: `src/components/battlepass/RewardNotificationProvider.tsx`**
- Add `useRealtimeChallengeProgress()` to keep UI in sync
- Add console logging for debugging realtime events

### 6. Add Daily Login Challenge Tracking
Create a hook that triggers the login challenge on app load.

**File: `src/hooks/useDailyLogin.ts`** (new file)
```typescript
import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

export function useDailyLoginChallenge() {
  const { profile } = useAuth();
  const triggeredRef = useRef(false);

  useEffect(() => {
    if (!profile?.id || triggeredRef.current) return;
    
    const triggerLogin = async () => {
      triggeredRef.current = true;
      
      // Call RPC to track daily login
      await supabase.rpc('track_daily_login');
    };

    triggerLogin();
  }, [profile?.id]);
}
```

**New RPC function:**
```sql
CREATE OR REPLACE FUNCTION track_daily_login()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_profile_id uuid;
  v_last_login date;
BEGIN
  -- Get profile ID from auth
  SELECT id INTO v_profile_id FROM profiles WHERE user_id = auth.uid();
  IF v_profile_id IS NULL THEN RETURN; END IF;
  
  -- Check last login date
  SELECT DATE(completed_at) INTO v_last_login
  FROM challenge_progress cp
  JOIN challenges c ON c.id = cp.challenge_id
  WHERE cp.user_id = v_profile_id 
  AND c.requirement_type = 'login'
  AND c.type = 'daily'
  ORDER BY cp.completed_at DESC
  LIMIT 1;
  
  -- Only credit if hasn't logged in today
  IF v_last_login IS NULL OR v_last_login < CURRENT_DATE THEN
    PERFORM increment_challenge_progress(v_profile_id, 'login');
  END IF;
END;
$$;
```

### 7. Update App.tsx to Include Daily Login Hook
Add the daily login challenge hook to `AuthenticatedPreloads` component.

---

## Files Changed Summary

| File | Change |
|------|--------|
| Database migration | Add `increment_challenge_progress` function and triggers for all action tables |
| Database migration | Enable realtime for `challenge_rewards` and `challenge_progress` tables |
| Database migration | Add `track_daily_login` RPC function |
| `src/hooks/useBattlePass.ts` | Add `useRealtimeChallengeProgress` hook |
| `src/hooks/useDailyLogin.ts` | New file - daily login tracking |
| `src/components/battlepass/RewardNotificationProvider.tsx` | Add progress subscription |
| `src/App.tsx` | Add daily login hook to `AuthenticatedPreloads` |

---

## Expected Behavior After Implementation

1. **Create a post** → Progress bar updates instantly, notification appears when challenge completes
2. **Leave a comment** → Same instant feedback
3. **Send a message** → Same instant feedback  
4. **Start a new conversation** → Same instant feedback
5. **Follow someone** → Both you and the followed user get credit
6. **Log in daily** → Daily check-in challenge completes with notification
7. **Invite a friend** → When they confirm, you get challenge credit

The notification modal will pop up immediately with the XP reward, and users can claim it right from the modal.
