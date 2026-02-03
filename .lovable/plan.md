
# Fix Display Name Styling + Badge Unlocking

## Problems Identified

### 1. Shine Animation Issue
The current "shine" effect shows a **moving white sweep overlay** that animates across the text. You want a **static shiny texture** applied to the text itself instead.

**Current behavior (lines 112-126 in StyledUsername.tsx)**:
```text
Text with gradient ←
  ↓
Moving white bar sweeps across every 2 seconds
```

**Desired behavior**:
```text
Shiny metallic gradient that glistens statically
(no moving overlay animation)
```

### 2. Badges Still Locked
The owner's profile (MrAssBurgers) has `user_id = NULL` in the profiles table. The badges were correctly granted to the auth user ID `703760a8-...`, but:
- `useUserBadges(profile.id)` looks for badges where `user_id = '6279adbf-...'` (profile ID)
- Badges are stored with `user_id = '703760a8-...'` (auth ID)

This ID mismatch means the Badge Library shows 0/18 unlocked even though 18 badges exist for the owner.

---

## Solution

### Part 1: Replace Shine Animation with Static Shiny Texture

Remove the moving overlay animation and replace with a CSS-based metallic/shiny gradient effect that doesn't move:

**Changes to `StyledUsername.tsx`**:
- Remove the `motion.span` overlay element for "shine" effect
- Apply a metallic gradient with a subtle highlight that makes text look shiny without animation
- Use CSS `background-image` with multiple gradient layers to create depth

**New shine style approach**:
```typescript
// Static shiny texture - no moving parts
if (badge?.effect === 'shine') {
  const shinyStyle = {
    ...style,
    // Add subtle highlight layer for metallic look
    textShadow: '0 1px 2px rgba(255,255,255,0.3)',
    filter: 'contrast(1.1) brightness(1.05)',
  };
  return (
    <span style={shinyStyle} className={cn('font-semibold', className)}>
      {nameToShow}
    </span>
  );
}
```

**Same change to `StyledDisplayName.tsx`** to ensure consistency.

### Part 2: Fix Badge ID Lookup

Update the `useUserBadges` hook to look up badges using the auth user ID, not the profile ID.

**Option A: Update hook to accept and use auth user ID**
- Modify `useUserBadges` to optionally accept auth user ID
- Update callers to pass the correct ID

**Option B: Fix database - link profile to auth user** (Preferred)
- Update the owner's profile to set `user_id = '703760a8-...'`
- Update `get_user_primary_badge` to handle lookup by profile ID through the linked user_id
- This also fixes the retroactive sync for all users

**Option B is preferred** because it fixes the root cause and ensures all badge-related features work correctly.

### Part 3: Update Database Functions

Update `get_user_primary_badge` to:
1. Accept a profile ID
2. Look up the corresponding auth user_id from the profiles table
3. Find badges using that auth user_id

---

## Implementation Steps

### Step 1: Update StyledUsername.tsx
- Remove the moving overlay animation from "shine" effect
- Replace with static shiny/metallic styling using text-shadow and filter
- Keep the gradient background for the text color

### Step 2: Update StyledDisplayName.tsx
- Apply the same static shine fix for consistency

### Step 3: Database Migration
- Fix the owner's profile to link `user_id` to auth ID
- Update `get_user_primary_badge` function to resolve profile ID → auth user_id → badges
- Update `sync_my_challenge_progress` to correctly map profile IDs

### Step 4: Update useUserBadges Hook
- Ensure badge lookup uses the auth user_id from the profile record
- Add fallback to check both profile.id and profile.user_id for compatibility

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/ui/StyledUsername.tsx` | Remove shine overlay animation, use static shiny style |
| `src/components/badges/StyledDisplayName.tsx` | Same shine fix for consistency |
| `src/hooks/useBadges.ts` | Update to use auth user_id for badge lookup |
| `supabase/migrations/new_migration.sql` | Fix profile user_id link, update get_user_primary_badge |

---

## Expected Result

After implementation:
- Display names show a static shiny/metallic texture (no moving animation)
- Owner sees all 18 badges unlocked in Badge Library
- Display name appears with gold gradient styling throughout the app
- All users who have completed challenges see their badges unlocked
