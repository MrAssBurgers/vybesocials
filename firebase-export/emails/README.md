# VYBE Auth Email Templates → Firebase

These are the same branded HTML templates the app uses on Lovable Cloud, rendered to static HTML so they work in **Firebase Authentication** and **Cloud Functions**.

## Files
- `signup.html` – Email verification on signup
- `recovery.html` – Password reset
- `magic-link.html` – Passwordless sign-in link
- `invite.html` – User invitation
- `email-change.html` – Email change confirmation
- `reauthentication.html` – 2FA / re-auth code

## Placeholders (already baked in)
| Token | Meaning |
|---|---|
| `%LINK%` | Action URL (or the code, for reauthentication) |
| `%EMAIL%` | Recipient email |
| `%NEW_EMAIL%` | New email (email-change only) |

## Option 1 — Paste into Firebase Console (easiest)

Firebase Auth has its own templating tokens. Open and replace once per template:

```
%LINK%       →  %LINK%        (Firebase already uses this)
%EMAIL%      →  %EMAIL%       (Firebase already uses this)
%NEW_EMAIL%  →  %NEW_EMAIL%   (Firebase already uses this)
```

So the files are **drop-in ready**. Go to:
**Firebase Console → Authentication → Templates → [Email verification / Password reset / etc.] → Edit → Customize action URL & HTML**

Paste the matching file's contents into the HTML body. Subject lines are in `functions/src/_shared/emailTemplates/index.ts` (`AUTH_EMAIL_SUBJECTS`).

> Firebase's built-in sender has a 20KB HTML limit — all our templates are < 10KB ✅.

## Option 2 — Custom sender via Cloud Functions

Use `renderAuthEmail()` from `functions/src/_shared/emailTemplates`:

```ts
import { renderAuthEmail, AUTH_EMAIL_SUBJECTS } from './_shared/emailTemplates';

const html = renderAuthEmail('recovery', { link: resetUrl, email: user.email });
await sendViaResend({ to: user.email, subject: AUTH_EMAIL_SUBJECTS.recovery, html });
```

This bypasses Firebase's default sender and lets you brand the `From:` as `no-reply@vybehub.app` via your Resend/SendGrid setup (already wired in `functions/src/email.ts`).

## Regenerating

Source `.tsx` lives at `supabase/functions/_shared/email-templates/`. To re-render after edits:

```bash
cd /tmp && cp -r /dev-server/supabase/functions/_shared/email-templates render-emails
cd render-emails
sed -i "s|'npm:react@18.3.1'|'react'|g; s|'npm:@react-email/components@0.0.22'|'@react-email/components'|g" *.tsx
bun add react@18.3.1 @react-email/components@0.0.22 @react-email/render@1.0.1
# then run the render script from chat history, output to firebase-export/emails/
```
