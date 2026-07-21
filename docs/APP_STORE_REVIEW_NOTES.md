# App Store Review Notes (VYBE)

Paste into **App Store Connect → App Review Information → Notes** (and use the Reply draft below).

**Submission:** Rejection of **1.2.8 (7180520)** / `74f32678-106f-4b6e-aaf4-4fc516abf279`.

**Tracking decision:** Keep **Tracking = Yes** in App Privacy. You must show the **system ATT prompt** and film it. Do **not** change App Privacy to “no tracking.”

**Auth note:** Despia uses in-app **ASWebAuthenticationSession** (not Safari.app). Film that.

---

## Notes (paste into App Review Information)

```
Demo account: [fill email] / [fill password]

Start URL: https://vybehub.app (Despia App Start URL).

=== TRACKING / ATT (Guideline 2.1) ===
App Privacy declares tracking (ads / identifiers). We show the system App Tracking Transparency prompt on first launch (before personalized advertising / IDFA use).
See ATT screen recording: [ATT_VIDEO_URL]

How to reproduce ATT:
1. Delete the app (or Settings → Privacy & Security → Tracking → reset for VYBE).
2. Fresh install → launch VYBE.
3. System dialog: “Allow [VYBE] to track your activity across other companies’ apps and websites?”
4. Allow or Ask App Not to Track → app continues to sign-in / home (no blank screen).

=== SIGN IN WITH APPLE (Guideline 4) ===
We do NOT re-require name or email after Sign in with Apple.
Apple name (when provided) is used/prefilled; name fields are optional for Apple users.
Onboarding only requires a unique @username. Email from Apple token / Private Relay — no second email form.

=== IN-APP AUTH (Guideline 4 — browser) ===
Email/password stays in the app WebView.
Google and Apple use ASWebAuthenticationSession (in-app sheet with Done/Cancel), not Safari.app.
See recording: [AUTH_UGC_VIDEO_URL]

=== UGC SAFETY (Guideline 1.2) ===
1) Create account → Terms/Privacy checkbox (required).
2) Publish gated by Vybe Check + server moderation.
3) Report: feed ⋯ → Report; or profile ⋯ → Report.
4) Block: profile ⋯ → Block → removed from feed immediately.
5) Reports → safety inbox + Admin → Reports; act within 24 hours.
   Contact: vybesocial.info@gmail.com
See recording: [AUTH_UGC_VIDEO_URL]

=== PARENTAL / AGE ===
Parental Controls: Settings → Account → Parental Controls (PIN).
Age Assurance: onboarding birthday step.
```

---

## Your checklist (Tracking = Yes path)

1. **Lovable** → Share → Publish.
2. **Despia**
   - Enable **AdMob** + **App Tracking Transparency** / ATT (so the system prompt actually shows).
   - Set `NSUserTrackingUsageDescription` (required for ATT).
   - Location purpose string (Friend Map); **NFC OFF**.
   - Rebuild → upload binary **> 1.2.8**.
3. **Leave App Privacy Tracking as-is** (Data Used to Track You stays). Do not chase “Tracking = No.”
4. **Film ATT** on physical iPhone: delete app → reinstall → launch → ATT dialog → Allow or Don’t Allow → app works.
5. **Film UGC + Apple login**: Terms → Apple in-app sheet → Report → Block.
6. Paste Notes + both video URLs into App Review Information.
7. Resolution Center reply below → submit new build.

### ATT purpose string (Despia Info.plist)

```
VYBE uses this identifier to deliver more relevant ads and measure ad performance across apps and websites.
```

(Or your preferred clear ATT string.)

### Location purpose string

```
VYBE uses your location while you use the app to power Friend Map. For example, when you open Friend Map, friends you choose can see that you are nearby (such as “at the park”). Location is not used for advertising or cross-app tracking.
```

---

## Reply to App Review

```
Hello App Review,

Thank you for the feedback on submission 74f32678-106f-4b6e-aaf4-4fc516abf279 (version 1.2.8).

We have addressed each guideline in build [NEW_BUILD]:

1) Guideline 4 — Sign in with Apple (name/email)
After Sign in with Apple we no longer require users to re-enter their name or email. When Apple provides a name on first authorization we use/prefill it; name fields are optional for Apple users. Email comes from the Apple identity token (including Private Relay). Onboarding still asks for a unique @username, which Apple does not provide.

2) Guideline 4 — Sign-in in the default browser
Sign-in/register stays in the app. Email/password never leaves the WebView. Google and Apple use ASWebAuthenticationSession (system in-app authentication sheet), not Safari.app. Screen recording: [AUTH_UGC_VIDEO_URL].

3) Guideline 1.2 — User-generated content
Terms are required before Create account. Content is filtered (Vybe Check + moderation). Users can Report and Block; blocks remove content from the feed immediately. Reports notify our safety team; we act within 24 hours. Contact: vybesocial.info@gmail.com
Screen recording: [AUTH_UGC_VIDEO_URL].

4) Guideline 2.1 — App Tracking Transparency
We continue to declare tracking in App Privacy. The system ATT permission request appears on fresh install / after resetting tracking permissions, before personalized tracking data is used. Screen recording: [ATT_VIDEO_URL].

Please let us know if anything else is needed.

Thank you,
[Your name]
```
