## Root causes found

1. **SMS "More sign-in options" toasts an error but the SMS arrives.** The `auth_challenges` table has a CHECK constraint that only allows `email_2fa | login_approval | qr_signin | passkey_register | passkey_login`. The `switch_to_sms` action in `auth-login-approval` (and the verifier in `auth-2fa-verify-phone`) inserts/reads `challenge_type = 'phone_2fa'`. Twilio sends the code first, then the DB insert is rejected by the CHECK, so the function returns `create_failed` and the UI never advances to the 6‑digit screen.

2. **"Email me a code" says "Couldn't email a code"** because `email_failed` is returned when `send-transactional-email` cannot push to the queue. On Live this is the documented "queue cron not provisioned until publish" issue — and the toast is too vague to tell the user that.

3. **Login button spinner appears frozen.** The custom `motion.div` spinner on the Landing login button does not carry the project's `data-allow-animation="true"` marker that other spinners (`LoadingSpinner`, `ButtonLoader`) use, so the global animation-gate freezes it on devices where reduced-motion / animation-gating is active.

## Changes

### 1. DB migration — allow `phone_2fa`
Drop and recreate `auth_challenges_challenge_type_check` to include `'phone_2fa'`. No data migration needed.

### 2. `LoginGateModal.tsx` — better busy/error UX
- Track which option is loading (`'email' | 'sms' | null`) instead of a single `busy` flag for the options screen, so only the clicked button spins and the other stays clickable.
- When `switch_to_sms` returns `ok:false`, if it's the legacy `create_failed` (i.e. SMS already sent), still advance to the SMS code screen using the `phone_verification_id` returned by `phone-verify-request`, so the user can enter the code they already got. (Belt-and-suspenders alongside the migration.)
- Friendlier error copy: distinguish "code sent but couldn't continue, try again", "no verified phone", "rate limited", "couldn't email a code right now — try SMS".

### 3. Landing login spinner
Replace the inline `motion.div` rotation with the existing `ButtonLoader` (or add `data-allow-animation="true"`) so the spinner actually animates while `loading` is true.

### 4. Live email reminder
After publish, the `process-email-queue` cron is provisioned on Live by the publish hook. Call out that the user needs to publish for the email-fallback path to deliver on the live app — code-only changes can't fix that.

## Files touched
- `supabase/migrations/<new>.sql` (CHECK constraint)
- `src/components/auth/LoginGateModal.tsx`
- `src/pages/Landing.tsx`

No changes to `phone-verify-request`, `phone-verify-confirm`, or `auth-2fa-verify-phone` are needed once the CHECK includes `phone_2fa`.