# App Store Review Notes (VYBE)

## July 20 rejection: exact release blockers

App Review rejected **1.2.8 (7180520)** under Guidelines **1.2, 2.1, and 4.0**:

1. Apple sign-in was followed by another name/email request.
2. Sign-in or registration opened the default browser instead of an in-app system authentication session.
3. The reviewer could not verify the full UGC safety flow: terms acceptance, filtering, reporting, blocking with immediate content removal, and developer notification.
4. The reviewer could not find the App Tracking Transparency prompt.

This needs a **new native binary**. Build 7180520 still contains the NFC TAG entitlement even though NFC is disabled in App Store review notes, and it does not contain the `com.apple.developer.applesignin` entitlement. Do not resubmit that build. The replacement binary must be signed with a regenerated provisioning profile, contain Sign in with Apple, and contain no NFC entitlement.

The repository is prepared as **1.2.9 (7180521)**, but the final Despia/Xcode archive must be inspected before uploading. A web-only Lovable publish cannot change native entitlements or the system OAuth presentation.

## Native privacy manifest

The iOS target includes `PrivacyInfo.xcprivacy` with Capacitor Filesystem's
required file-timestamp reason (`C617.1`). Keep the file in the App target's
Copy Bundle Resources phase when rebuilding or regenerating the Xcode project.

Paste into **App Store Connect → App Review Information → Notes** (and use the Reply draft below).

**Submission:** Rejection of **1.2.8 (7180520)** / `74f32678-106f-4b6e-aaf4-4fc516abf279`.

**Tracking decision required before upload:**

- If VYBE uses AdMob for personalized ads, IDFA, or cross-app tracking, keep **Tracking = Yes**, request ATT before any tracking begins, support the denied path, and film the fresh-install prompt.
- If ads are non-personalized and no SDK links VYBE data with third-party data for advertising, remove tracking from the native configuration and correct App Privacy to **Tracking = No** after a real SDK/data-flow audit.

Do not claim either path in review notes until the shipped binary has been tested. The current App Privacy form marks many data types as tracking, so selecting the no-tracking path also requires updating that form.

**Auth note:** The new binary must use native Sign in with Apple or an in-app `ASWebAuthenticationSession`/`SFSafariViewController`, never Safari.app. Film the exact shipped binary; do not claim this based only on the web source.

---

## Notes (paste into App Review Information)

```
Demo account: [fill email] / [fill password]

Start URL: https://vybehub.app (Despia App Start URL).

=== TRACKING / ATT (Guideline 2.1) ===
[KEEP ONLY IF VERIFIED] App Privacy declares tracking (ads / identifiers). We show the system App Tracking Transparency prompt on first launch, before personalized advertising / IDFA use.
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
[VERIFY IN THE SHIPPED BINARY] Google and Apple use an in-app system authentication sheet, not Safari.app.
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

## Your checklist

1. **Lovable** → Share → Publish.
2. **Despia**
   - Choose and verify the personalized/tracking or non-personalized/no-tracking ads path.
   - If tracking, enable ATT and set `NSUserTrackingUsageDescription`; no tracking SDK may initialize before the choice.
   - Use native/in-app OAuth; location purpose string is Friend Map only; **NFC OFF**.
   - Regenerate the provisioning profile after capability changes.
   - Rebuild → upload binary **> 1.2.8**.
3. Inspect the signed archive entitlements: Sign in with Apple present, NFC absent. Reconcile App Privacy with the shipped SDK behavior.
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
[TRACKING PATH ONLY] We declare tracking in App Privacy. The system ATT permission request appears on fresh install / after resetting tracking permissions, before any personalized tracking data is used. The app remains functional when permission is denied. Screen recording: [ATT_VIDEO_URL].

Please let us know if anything else is needed.

Thank you,
[Your name]
```
