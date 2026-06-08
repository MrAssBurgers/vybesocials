# Auth codes, SMS, email & push — production checklist

If sign-in codes, SMS verify, or OneSignal notifications fail, verify **Supabase edge functions are deployed** and **secrets are set**.

## 1. Deploy edge functions (required)

Production project `hprmicwhlaaqfgshucec` must have these functions deployed. As of the last check, only `get-profile-full`, `confirm-referral`, and `send-reset-email` were live — **auth/SMS/push functions were missing**, which breaks login codes and notifications.

```bash
npx supabase login
npx supabase functions deploy \
  auth-2fa-preauth \
  auth-2fa-verify \
  auth-2fa-verify-phone \
  auth-2fa-request \
  auth-login-approval \
  phone-verify-request \
  phone-verify-confirm \
  process-email-queue \
  send-transactional-email \
  send-push-notification \
  --project-ref hprmicwhlaaqfgshucec
```

## 2. Supabase secrets

Set in **Supabase Dashboard → Project Settings → Edge Functions → Secrets**:

| Secret | Used for |
|--------|----------|
| `RESEND_API_KEY` | Transactional email fallback |
| `RESEND_FROM_EMAIL` | Sender address |
| `TWILIO_ACCOUNT_SID` | SMS (must start with `AC`) |
| `TWILIO_AUTH_TOKEN` | SMS |
| `TWILIO_VERIFY_SERVICE_SID` | SMS Verify (must start with `VA`) |
| `ONESIGNAL_APP_ID` | Push (`85bcf4b4-16fb-4101-90b3-59ca9574e57b`) |
| `ONESIGNAL_REST_API_KEY` | Push API |

## 3. Email queue worker

Login codes enqueue into **`auth_emails`** (pgmq). The **`process-email-queue`** function must run on a schedule (cron every ~5s). Confirm in Supabase **Database → Cron jobs** or invoke manually once to drain backlog.

## 4. Despia / iOS push

Native app uses Despia OneSignal bridge (not the web SDK). After sign-in:

1. Tap **Enable notifications** when prompted (Settings → Notifications also works).
2. Despia dashboard must have OneSignal App ID configured for the iOS build.
3. `push_tokens` row should appear with platform `despia` and a real player id (not only `despia:{uuid}` placeholder).

## 5. Test flows

- **Email login:** Sign in → 6-digit code modal → code arrives within ~1 min → verify → lands on Home.
- **SMS login:** Login approval → More options → Text me a code → requires **verified phone** on account.
- **Push:** Settings → Notifications → enable → send yourself a DM from another account.
