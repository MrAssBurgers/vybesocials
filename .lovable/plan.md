# Fix Auth + Design Your VYBE + Fonts

## 1. Signup: kill the "already registered" loop, make it instant

**Root cause:** `signUp()` in `src/lib/auth.tsx` creates the `auth.users` row, then *client-side* inserts into `profiles`. If that insert fails (RLS race before the JWT is fully active, or any transient error), the code signs out — but the `auth.users` row is left behind. Next attempt: "email already registered." There is no `handle_new_user` trigger in the database today.

**Fix:**
- Add a Postgres trigger `handle_new_user` on `auth.users` (AFTER INSERT) that creates the profile from `NEW.raw_user_meta_data->>'username'` and `NEW.email`. `SECURITY DEFINER`, `SET search_path = public`, conflict-safe (`ON CONFLICT (user_id) DO NOTHING`).
- In `signUp()`, pass `options.data: { username: cleanUsername }` and remove the manual `profiles.insert` + sign-out cleanup. Keep the username-availability RPC check before calling `supabase.auth.signUp`.
- Navigate to `/onboarding` immediately after `signUp()` returns no error — no extra round trips.
- (Email confirmations remain off — already the current behavior; signup yields a session immediately.)

## 2. Login: instant redirect

In `src/pages/Landing.tsx` `handleSubmit` (login branch):
- Drop the post-login `supabase.auth.getUser()` + `profiles.select` round trip.
- Navigate straight to `/home`. The existing route gate / `useEffect` on `authProfile` already routes to `/onboarding` if `username` is missing or `onboarding_completed === false`.

## 3. Auth page: less glitch

In `src/pages/Landing.tsx`:
- Collapse the three stacked 80px-blur radial-gradient layers to one lightweight static gradient (single fixed div, no blur filter, opacity ~0.35). Mobile compositor struggles with 3 huge blurred layers.
- Replace the username field's `AnimatePresence` height animation with a fade-only transition (height-animating an Input causes layout thrash on every mode toggle and is the visible "glitch").

## 4. Design Your VYBE: smooth on mobile

In `src/components/onboarding/AIVybeDesigner.tsx`:
- Remove the two infinite counter-rotating 120px-blur conic-gradient auroras (top-left and bottom-right). Replace with a single static radial gradient (already present as the "Deep space gradient").
- Remove the perspective grid floor and the floating particles on viewports `<768px` (or always — they're decorative). Keep the scan line during build only.
- Drop the `layoutId="vybe-orb"` morph between steps; do a simple fade/scale instead. The shared-layout transform is the main jank source between Vibe → Style → Preview.
- Keep all `reduceMotion` short-circuits intact.

## 5. Fonts actually show up

In `src/hooks/useApplyThemeFonts.ts`, `loadGoogleFonts()`:
- Change the URL from `&display=optional` to `&display=swap`. With `optional`, browsers that don't have the font cached within ~100ms will use the fallback **and never swap in the loaded font** — which is exactly the bug ("text fonts don't show up"). `swap` always uses the webfont once it loads.
- Keep the `document.fonts.load(...)` await before applying, so the swap happens cleanly without a separate FOUT.

## Technical notes

- New migration adds:
  ```sql
  create or replace function public.handle_new_user()
  returns trigger language plpgsql security definer set search_path = public as $$
  begin
    insert into public.profiles (user_id, username, email, bio)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'username', 'user_' || substr(new.id::text,1,8)),
      new.email,
      ''
    )
    on conflict (user_id) do nothing;
    return new;
  end $$;

  drop trigger if exists on_auth_user_created on auth.users;
  create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();
  ```
- Files edited: `src/lib/auth.tsx`, `src/pages/Landing.tsx`, `src/components/onboarding/AIVybeDesigner.tsx`, `src/hooks/useApplyThemeFonts.ts`.
- No changes to `profiles` schema or existing RLS.
