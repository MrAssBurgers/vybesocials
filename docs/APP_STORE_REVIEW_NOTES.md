# App Store Review Notes (VYBE)

Paste into **App Store Connect → App Review Information → Notes** (and use the Reply draft below).

**Submission:** Rejection of **1.2.8 (7180520)** / `74f32678-106f-4b6e-aaf4-4fc516abf279`.

**Code shipped:** `c806f3a92` on `main` (SIWA name skip, UGC Report/Block, Tracking=No ads, review copy).

**Note:** Despia does **not** expose a user-toggle for true AuthenticationServices (`nativeauth://`). Store login uses in-app **ASWebAuthenticationSession** — that is fine for this reply if you film that it stays inside VYBE (not Safari.app).

---

## Notes (paste into App Review Information)

```
Demo account: [fill email] / [fill password]
(Use credentials already on file in App Store Connect if present.)

Start URL: https://vybehub.app (Despia App Start URL).

=== TRACKING (Guideline 2.1) ===
This build does NOT track users. App Privacy → Tracking = No.
We do not collect IDFA for advertising and do not show an ATT prompt.
Ads (if shown) are non-personalized only.

=== SIGN IN WITH APPLE (Guideline 4) ===
We do NOT re-require name or email after Sign in with Apple.
Apple name (when provided on first authorize) is used/prefilled; name fields are optional for Apple users.
Onboarding only requires a unique @username (Apple does not provide an app handle).
Email comes from the Apple identity token / Private Relay — no second email form.

=== IN-APP AUTH (Guideline 4 — browser) ===
Email/password register and login stay inside the app WebView.
Google and Apple use ASWebAuthenticationSession (system in-app auth sheet with Done/Cancel) — not the default Safari.app browser.
See screen recording: [VIDEO_URL]

=== UGC SAFETY (Guideline 1.2) — see recording ===
1) Create account → Terms/Privacy checkbox (required) before Continue.
2) Publish gated by Vybe Check + server moderation.
3) Report: feed post ⋯ → Report → reason → Submit; or profile ⋯ → Report.
4) Block: profile ⋯ → Block → content removed from feed immediately.
5) Reports email safety inbox + Admin → Reports; we act within 24 hours.
   Contact: vybesocial.info@gmail.com

=== PARENTAL / AGE ===
Parental Controls: Settings → Account → Parental Controls (PIN).
Age Assurance: onboarding birthday step.
```

---

## Your checklist (do in order)

1. **Lovable** → Share → Publish (`vybehub.app`).
2. **Despia rebuild** (only): set Friend Map location purpose string; turn **NFC OFF**; upload binary **> 1.2.8**.  
   Do **not** wait on nativeauth — you can’t enable it yourself.
3. **App Store Connect** → App Privacy → **Tracking = No** → Save.
4. **Film** on a physical iPhone (~90s): Terms checkbox → Apple login sheet stays in VYBE → Report post → Block user.
5. Upload video; paste **Notes** above + demo login + video URL into App Review Information.
6. **Resolution Center** → paste Reply below (fill build #, video URL, name).
7. Submit the **new** build.

---

## Location purpose string (Despia Info.plist on rebuild)

```
VYBE uses your location while you use the app to power Friend Map. For example, when you open Friend Map, friends you choose can see that you are nearby (such as “at the park”). Location is not used for advertising or cross-app tracking.
```

---

## Reply to App Review (paste into Resolution Center)

```
Hello App Review,

Thank you for the feedback on submission 74f32678-106f-4b6e-aaf4-4fc516abf279 (version 1.2.8).

We have addressed each guideline in build [NEW_BUILD]:

1) Guideline 4 — Sign in with Apple (name/email)
After Sign in with Apple we no longer require users to re-enter their name or email. When Apple provides a name on first authorization we use/prefill it; name fields are optional for Apple users. Email comes from the Apple identity token (including Private Relay). Onboarding still asks for a unique @username, which Apple does not provide.

2) Guideline 4 — Sign-in in the default browser
Sign-in/register stays in the app. Email/password never leaves the WebView. Google and Apple use ASWebAuthenticationSession (system in-app authentication sheet with Done/Cancel), not Safari.app. Screen recording: [VIDEO_URL].

3) Guideline 1.2 — User-generated content
- Terms acceptance is required before Create account (shown in recording).
- Objectionable content is filtered via Vybe Check before publish plus server moderation.
- Users can Report posts/comments/profiles and Block users; blocks remove content from the feed immediately.
- Reports notify our safety inbox and Admin → Reports; we act within 24 hours. Contact: vybesocial.info@gmail.com
Screen recording (Terms + Report + Block): [VIDEO_URL].

4) Guideline 2.1 — App Tracking Transparency
This build does not track users. App Privacy declares Tracking = No. We do not show an ATT prompt because we do not collect data for tracking / IDFA advertising. Ads are non-personalized only.

Please let us know if anything else is needed.

Thank you,
[Your name]
```
