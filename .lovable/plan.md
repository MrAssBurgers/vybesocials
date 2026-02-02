
Goal
- Fix “Failed to save preferences” in Daily Brief settings so topics/categories can be added and saved reliably.

What’s actually broken (diagnosis)
- The `ai_brief_preferences.user_id` column is currently constrained to `auth.users(id)` via this foreign key:
  - `ai_brief_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`
- But the app (and the Daily Brief backend function) is now correctly using your app-level profile ID (`profiles.id`) when reading/writing preferences:
  - Frontend: `AIBriefCustomizeSheet.tsx` upserts with `user_id: profile.id`
  - Daily Brief generator: `ai-catch-up` reads `.eq('user_id', profileId)`
- Result: when you click “Save Preferences”, the insert/update fails because `profile.id` is not an `auth.users.id`, so the foreign key rejects it (this presents as “Failed to save preferences” in the UI).

Extra important detail
- There are already existing preference rows in the database (2 rows), and they currently store `auth.users.id` values (not `profiles.id`). So even after fixing saving, we must migrate existing rows so old preferences still load.

Plan (implementation steps)

1) Backend/database fix (required)
A. Remove the wrong foreign key to the authentication table
- Drop constraint: `ai_brief_preferences_user_id_fkey` (currently points to `auth.users`)

B. Migrate existing preference rows from auth user ids -> profile ids
- Convert existing rows using the mapping: `profiles.user_id (auth id) -> profiles.id (profile id)`
- SQL concept:
  - `UPDATE ai_brief_preferences abp SET user_id = p.id FROM profiles p WHERE p.user_id = abp.user_id;`
- This must happen after dropping the old FK, otherwise the update would immediately violate the existing FK.

C. Add the correct foreign key to profiles
- Add: `FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE`
- This enforces the intended model everywhere: preferences belong to a profile.

D. Tighten Row Level Security policies to match the profile-id model (and keep it secure)
- Keep using `current_profile_id()` but explicitly restrict to signed-in users:
  - SELECT: allow only where `user_id = current_profile_id()`
  - INSERT/UPDATE: allow only when `user_id = current_profile_id()`
  - Add `TO authenticated` on policies
- Notes:
  - This makes the table private (no anonymous reading/writing).
  - This matches how the rest of the app treats profile-owned rows.

Deliverable: a new migration SQL file that performs (A→D) in a single transaction.

2) Frontend robustness improvements (recommended, small)
Even after the DB fix, we should make the UI more resilient and easier to debug:

A. Stop re-querying `profiles` in AIBriefCustomizeSheet
- The app already loads `profile` in `useAuth()` (see `src/lib/auth.tsx`)
- Update `AIBriefCustomizeSheet.tsx` to use `const { user, profile } = useAuth();` and prefer `profile.id` directly.
- Fallback behavior if `profile` is temporarily null:
  - Call `supabase.rpc('claim_profile_by_email')` (same pattern used in AuthProvider) and then re-fetch profile, or block saving with a clear message.

B. Improve the error toast so you don’t get a generic “Failed to save preferences”
- When `upsert` fails, show a more actionable message:
  - If it’s a permissions issue: “You don’t have permission to update preferences. Please sign out/in.”
  - If it’s a constraint/validation issue: “Couldn’t save preferences due to a data mismatch. (We log the details.)”
- Keep detailed errors in `console.error` for debugging.

3) Verification / Pass conditions (what we will test)
A. Preferences saving
- Open Daily Brief → Settings → add a new category/topic → Save
- Expected:
  - Success toast
  - Sheet closes
  - Re-open settings: the topic is still there

B. Existing users keep their previous preferences
- For accounts that already had preferences saved before: verify they load and can be updated.
- This confirms the migration (auth id → profile id) worked.

C. Daily Brief uses all selected categories
- After saving, refresh Daily Brief:
  - Ensure combined interests = onboarding interests + custom topics – excluded topics
  - Ensure the backend function reads the preference row successfully.

Risk & edge cases (and how we handle them)
- If any preference row cannot be mapped to a profile (should be rare), we’ll either:
  - delete the unmappable row (safe because preferences are non-critical), or
  - leave it unmigrated and it will fail the new FK (we will avoid this by adding a safety check before re-adding the FK).
- Realtime / messaging is unaffected by this change.

Files & areas that will change (once approved)
- Database migration: new SQL migration under `supabase/migrations/…` to:
  - drop old FK to auth users
  - migrate existing data to profile ids
  - create new FK to profiles
  - (re)create RLS policies with `TO authenticated`
- Frontend:
  - `src/components/home/AIBriefCustomizeSheet.tsx` to use `useAuth().profile` (and optionally add clearer error handling)

Outcome
- “Save Preferences” will work immediately.
- Categories/topics will persist and be used by the Daily Brief generator.
- No more silent failures caused by the ID-model mismatch.
