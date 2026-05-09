## Root cause

`ensure_2fa_settings()` was redeployed to `RETURNS TABLE(...)`, so `supabase.rpc('ensure_2fa_settings')` now returns an **array** instead of a single row. `SecuritySection.tsx` does `setSettings(s as any)` and reads `settings?.email_2fa_enabled` — which is always `undefined` on an array.

Result:
- Email 2FA switch always renders OFF, even after toggling.
- Login Approvals switch always renders OFF.
- Optimistic toggle spreads an array into an object → state goes garbage → next `load()` overwrites it back to the array → UI snaps back.
- Face ID card is unrelated to the persistence bug, but on web it only shows "open in the mobile app" — that's intentional, not broken. Will leave as-is unless you want a web WebAuthn fallback (you already have a separate Passkeys card for that).

## Fix

### `src/components/settings/SecuritySection.tsx`
1. Normalize the RPC response: `const row = Array.isArray(s) ? s[0] : s;` then `setSettings(row ?? { email_2fa_enabled: false, login_approvals_enabled: false });`
2. Keep the optimistic update, but guarantee a row exists before update by doing an `upsert` instead of `update` (covers the case where `ensure_2fa_settings` failed silently or RLS blocked an insert path):
   ```ts
   await supabase
     .from('user_2fa_settings')
     .upsert({ user_id: user.id, ...settings, ...patch }, { onConflict: 'user_id' });
   ```
3. On error, restore the previous value (don't just `load()` which re-fetches the same array shape).

### No DB / edge-function changes
The RPC is fine; only the client was misreading it.

### Out of scope
- Face ID web fallback (Passkeys card already covers this).
- Any 2FA email/login-approval flow changes (those work once the toggle actually persists).

## Verification
- Toggle Email 2FA → refresh → switch stays on.
- Toggle Login Approvals → refresh → switch stays on.
- Sign out, sign in with email/password → 2FA gate appears as expected.
