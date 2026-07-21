# App Store Review Notes (VYBE)

Paste into **App Store Connect → App Review Information → Notes** (and use the Reply draft below).

**Submission context:** Remediation for rejection of **1.2.8 (7180520)** / `74f32678-106f-4b6e-aaf4-4fc516abf279` (Guidelines 4 SIWA + in-app auth, 1.2 UGC, 2.1 ATT).

---

## Notes (paste into App Review Information)

```
Demo account: [fill email] / [fill password]
(Use the existing demo credentials already on file in App Store Connect if present.)

Start URL / build: Production web is https://vybehub.app (Despia App Start URL). Native binary must be rebuilt after Info.plist / nativeauth changes.

=== TRACKING (Guideline 2.1) ===
This build does NOT track users. App Privacy → Tracking = No.
We do not collect IDFA for advertising, and we do not show an App Tracking Transparency prompt.
Ads (if shown) are non-personalized only. Personalized ads + ATT are not enabled in this submission.

=== SIGN IN WITH APPLE (Guideline 4) ===
Sign in with Apple uses the in-app native AuthenticationServices path when available (Despia nativeauth://), otherwise an in-app ASWebAuthenticationSession sheet (not Safari.app).
We do NOT re-require name or email after Apple Sign-In. Apple-provided name is captured on first authorization; onboarding only requires a unique @username (Apple does not provide an app handle). Email comes from the Apple identity token / Private Relay — no second email form.

How to verify:
1. Fresh install → Sign in with Apple → complete Face ID / Apple sheet inside VYBE.
2. Onboarding: choose @username (+ birthday / interests / legal). Name fields are optional for Apple users and prefilled when Apple provided a name.
3. You are never asked to re-enter the Apple email.

=== IN-APP AUTH (Guideline 4 — browser) ===
Email/password register and login stay entirely inside the app WebView.
Google uses in-app ASWebAuthenticationSession (system sheet with Done/Cancel) — not the default Safari.app browser.
Apple uses native Sign in with Apple when the native bridge is present.

=== UGC SAFETY (Guideline 1.2) — FILM THESE ===
Please watch the attached screen recording (Notes / Resolution Center link):

1) EULA / Terms before register
   Landing → Create account → checkbox “I agree to the Terms of Service and Privacy Policy” (required) → Continue.

2) Filter objectionable content
   Create → capture/upload → Vybe Check runs before Publish (Share stays blocked until safe). Server AI moderation + client text filters.

3) Flag / report content
   Home feed → post ⋯ → Report → pick a reason → Submit Report.
   Or open any profile /u/{username} → ⋯ → Report.

4) Block abusive users
   Profile /u/{username} → ⋯ → Block → confirm.
   Blocked user’s posts are removed from the viewer’s feed immediately.
   Settings → Privacy → Blocked Users lists blocks.

5) Developer action ≤24 hours
   Reports write to Firestore `reports` and email the safety inbox; staff review in Admin → Reports (pending queue). Policy: remove content / eject abusers within 24 hours.
   Safety contact: vybesocial.info@gmail.com

=== LOCATION (if asked) ===
Friend Map only while using that feature. Friend Link is QR-only (no NFC).
Purpose string: “VYBE uses your location while you use the app to power Friend Map…”

=== PARENTAL / AGE ===
Parental Controls: Settings → Account → Parental Controls (PIN).
Age Assurance: onboarding birthday step.
```

---

## Screen recording checklist (physical iPhone)

Film 60–120s covering:

| # | Scene | Must show |
|---|--------|-----------|
| 1 | Create account | Terms checkbox before Continue |
| 2 | Sign in with Apple | System Apple sheet **inside** VYBE (not Safari.app address bar) |
| 3 | After SIWA | Onboarding without forced re-entry of Apple name/email |
| 4 | Report | Feed ⋯ → Report → reason → success toast |
| 5 | Block | Profile ⋯ → Block → return to Home (blocked content gone) |

Upload to a private link (or attach in Notes) and paste the URL in App Review Information + Resolution Center reply.

---

## ASC checklist (you)

1. **App Privacy** → Data Collection → **Tracking = No** (Account Holder/Admin). Align answers with non-personalized ads only.
2. Paste Notes above + demo account + **recording URL**.
3. **Despia rebuild** with:
   - `nativeauth://` Apple Sign-In (AuthenticationServices) if not already shipping
   - Location purpose string (Friend Map)
   - NFC capability **OFF**
4. Lovable → Share → Publish so `vybehub.app` has the OTA web fixes.
5. Submit new binary **> 1.2.8**.

---

## Despia / Xcode — location purpose string (REQUIRED rebuild)

**NSLocationWhenInUseUsageDescription**

```
VYBE uses your location while you use the app to power Friend Map. For example, when you open Friend Map, friends you choose can see that you are nearby (such as “at the park”). Location is not used for advertising or cross-app tracking.
```

### NFC capability — turn OFF on next native rebuild

Disable NFC addon so Info.plist no longer advertises NFC Tag Reading.

---

## Age Rating (App Store Connect — App Information)

Claim **Parental Controls** and **Age Assurance** (not None). Paths in Notes above.

---

## Reply to App Review (paste into Resolution Center)

```
Hello App Review,

Thank you for the feedback on submission 74f32678-106f-4b6e-aaf4-4fc516abf279 (version 1.2.8).

We have addressed each guideline as follows in build [NEW_BUILD]:

1) Guideline 4 — Sign in with Apple (name/email)
After Sign in with Apple we no longer require users to re-enter their name or email. Apple-provided name is captured from Authentication Services on first authorization and prefilled; name fields are optional for Apple users. Email comes from the Apple identity token (including Private Relay). Onboarding still asks for a unique @username, which Apple does not provide.

2) Guideline 4 — Sign-in in the default browser
Sign-in/register stays in the app. Email/password never leaves the WebView. Apple uses native Sign in with Apple (AuthenticationServices) when available; otherwise an in-app authentication session sheet (ASWebAuthenticationSession) — not Safari.app. Google uses the same in-app session sheet. Screen recording: [VIDEO_URL].

3) Guideline 1.2 — User-generated content
- Terms of Service acceptance is required before Create account (shown in recording).
- Objectionable content is filtered via Vybe Check before publish plus server moderation.
- Users can Report posts (⋯ menu), comments, and profiles, and Block users from profile ⋯; blocks remove content from the feed immediately.
- Reports notify our safety inbox and appear in Admin → Reports; we act within 24 hours (remove content / eject abusers). Contact: vybesocial.info@gmail.com
Screen recording of Terms + Report + Block: [VIDEO_URL].

4) Guideline 2.1 — App Tracking Transparency
This build does not track users. We updated App Privacy so Tracking is declared as No. We do not show an ATT prompt because we do not collect data for tracking / IDFA advertising in this submission. Ads are non-personalized only.

Please let us know if anything else is needed.

Thank you,
[Your name]
```

---

## Friend Link demo (QR only)

Film on a **physical iPhone** if location/Friend Link is questioned: Friend Link → QR display/scan. No NFC.
