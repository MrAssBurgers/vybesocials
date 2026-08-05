# Auth codes, SMS, email & push — production checklist

Firebase project: `vybe-daaab`. Client: Lovable Publish → `vybehub.app`.

## How the three 2FA paths work

| Path | Setting | What happens |
|------|---------|----------------|
| **Email code** | Settings → Email 2-Step Verification | Every password/OAuth sign-in soft-gates until a 6-digit Resend email code is verified |
| **Login confirmation** | Settings → Login confirmation | New device is blocked; already-signed-in device gets OneSignal push + in-app “Someone is trying to log in” popup + notification row. Approving mints a custom token for the new device |
| **SMS fallback** | Login confirmation → More options → Text me a code | Uses the account’s **verified** phone via Twilio Verify |

## Required secrets (Secret Manager)

```bash
# Email (already live)
gcloud secrets versions access latest --secret=RESEND_API_KEY --project=vybe-daaab
gcloud secrets versions access latest --secret=EMAIL_FROM --project=vybe-daaab

# Push (already live)
# ONESIGNAL_APP_ID / ONESIGNAL_REST_API_KEY

# SMS — set real Twilio Verify credentials (placeholders exist until you replace them)
printf 'ACxxxxxxxx' | gcloud secrets versions add TWILIO_ACCOUNT_SID --project=vybe-daaab --data-file=-
printf 'your_auth_token' | gcloud secrets versions add TWILIO_AUTH_TOKEN --project=vybe-daaab --data-file=-
printf 'VAxxxxxxxx' | gcloud secrets versions add TWILIO_VERIFY_SERVICE_SID --project=vybe-daaab --data-file=-
```

Then redeploy:

```bash
npx firebase deploy --only \
  functions:auth2faRequest,functions:auth2faVerify,functions:auth2faVerifyPhone,functions:phoneVerifyRequest,functions:phoneVerifyConfirm,functions:authLoginApproval,functions:authLoginNotify \
  --project vybe-daaab
```

## Client publish

Lovable → Share → Publish so gate UI / approval sheet polling reaches production.

## Canary

1. Verify a phone under Settings → Phone number.
2. Enable Email 2-Step and Login confirmation.
3. Sign in from a second browser/device → first device shows approve popup + push.
4. On the waiting device: More options → Email me a code / Text me a code.
