# SMS verification + Contact discovery + Device-approval fix

## 1. Phone numbers & SMS verification

**Database (migration)**
- `profiles`: add `phone text` (E.164), `phone_verified_at timestamptz`, `phone_e164_sha256 text` (indexed), `contact_discoverable boolean default false`. Unique partial index on verified phones.
- New table `phone_verifications(id, user_id nullable, phone, code_hash, purpose, expires_at, attempts, consumed_at)` — RLS: service-role only.
- New table `contact_hashes(user_id, sha256, created_at)` PK `(user_id, sha256)` — RLS: owner only.
- RPC `match_contacts(hashes text[])` SECURITY DEFINER → returns profiles where `phone_e164_sha256 = ANY($1)` AND `contact_discoverable = true`, excluding self and already-friends.

**Edge functions (OneSignal SMS)**
- `phone-verify-request` — input `{ phone, purpose }`. Rate-limit (1/min, 5/hr per phone+IP). Generate 6-digit code, store SHA-256 hash with 10-min TTL, send via OneSignal SMS API (`POST https://api.onesignal.com/notifications` with `name:"sms"`, `sms_from`, `include_phone_numbers`).
- `phone-verify-confirm` — input `{ phone, code, purpose, userId? }`. Validates, marks consumed, on `signup`/`add` stamps `profiles.phone_verified_at` + `phone_e164_sha256`. On `login` returns `{ ok:true }` so client proceeds with the already-staged session.

**UI**
- Signup flow: after email/password account creation, insert a **"Verify your phone"** step. Phone input (libphonenumber-js format) → send code → 6-digit OTP entry. Blocks `/home` until verified (`profiles.phone_verified_at` IS NULL gate).
- Login flow: after Supabase password sign-in succeeds, if the user's `phone_verified_at` is set AND this device isn't in `user_sessions`, require SMS OTP before navigating away. Trusted devices skip.
- Settings → Security: "Phone number" card — show masked verified phone, allow change/re-verify.

## 2. Contact discovery

**UI** — Settings → Privacy → "Find friends from contacts":
- Toggle: **"Let friends find me by phone number"** (writes `profiles.contact_discoverable`).
- Button: **"Sync contacts"** — explains hashing, then:
  - Native (Despia): bridges to system contacts permission, returns numbers.
  - Web fallback: `navigator.contacts.select(['tel'], {multiple:true})` if available.
- Client normalizes each phone to E.164, SHA-256 hashes, batches into `contact_hashes` upsert + calls `match_contacts` RPC.
- Result sheet: list of matched profiles with avatar, name, **"Add friend"** button (reuses existing friend-request mutation). "Clear my uploaded contacts" button purges `contact_hashes`.

## 3. Device-approval smart-gate

In `supabase/functions/auth-login-approval/index.ts` `action:'request'`:
- After resolving the user, query `user_sessions` for any row with `revoked_at IS NULL` AND `last_seen_at > now()-interval '60 days'`.
- If zero → return `{ ok:true, requiresApproval:false }` immediately (no push, no challenge row). First-device sign-ins won't get the dead "Approve sign-in?" prompt.
- Otherwise behave as today.

## Files

**New**
- `supabase/functions/phone-verify-request/index.ts`
- `supabase/functions/phone-verify-confirm/index.ts`
- `src/lib/phone.ts` — E.164 normalize + SHA-256 helper
- `src/lib/oneSignalSms.ts` (client-only types; sending is server)
- `src/components/auth/PhoneVerifyStep.tsx`
- `src/components/auth/PhoneOtpStep.tsx`
- `src/components/settings/ContactSyncCard.tsx`
- `src/components/settings/PhoneNumberCard.tsx`

**Edited**
- DB migration (schema + RPC)
- `src/pages/Landing.tsx` (signup → phone step; login → OTP step when needed)
- `src/components/settings/SecuritySection.tsx` (mount PhoneNumberCard + ContactSyncCard)
- `supabase/functions/auth-login-approval/index.ts` (active-session gate)

## Technical notes

- OneSignal SMS requires the SMS channel enabled in the OneSignal dashboard with a sender number; if it's not provisioned the request edge function will surface a clear `sms_not_configured` error.
- All phone hashing uses canonical E.164 (`libphonenumber-js`) then `SHA-256(lowercased)` so both sides match.
- Codes are 6 digits, SHA-256 hashed at rest, 10-min TTL, max 5 attempts, single-use.
- No phone numbers stored in plaintext for non-owners — only the hash is queryable via `match_contacts`.
- Despia contacts permission goes through the existing Despia bridge pattern (`despiaBridge.ts`); web fallback degrades gracefully.

Approve and I'll build it end-to-end.