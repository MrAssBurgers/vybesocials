# App Store Review Notes (VYBE)

Paste into **App Store Connect → App Review Information → Notes** when submitting.

## NFC (Guideline 2.1)

VYBE includes optional NFC / “Phone Tap” friend-sharing on devices that support it (iPhone with Core NFC). If review hardware does not support NFC, the UI falls back to QR friend invite.

Demo account: use the provided reviewer credentials. Path: **Add Friends → Phone Tap / NFC** (or Friend Drop → NFC). Hold two phones together only when both support NFC; otherwise open QR from the same sheet.

If a filmed NFC demo is required: attach a link to a physical-device screen recording showing Friend Drop → NFC → (QR fallback if no tag available).

**If reviewing without NFC hardware:** Reply that NFC is optional hardware pairing and QR provides the same friend-invite workflow; no dedicated NFC accessory is required for core app use.

## Age Rating / In-App Controls (Guideline 2.3.6)

Set **Parental Controls** and **Age Assurance** to **None** on the App Information age-rating questionnaire unless/until those products ship in-app. VYBE does not currently expose Parental Controls or Age Assurance UI.

## Tracking / cookies (Guideline 5.1.1(iv))

- Native builds use iOS App Tracking Transparency. If the user selects **Ask App Not to Track**, optional/ad tracking cookies are declined automatically; only essential signed-in storage remains.
- Cookie banner copy states we do not track across other companies’ apps/sites without permission.
- Non-personalized ads may still show when ATT is denied; we do not link ATT-denied users for advertising tracking.

## Location purpose string (Guideline 5.1.1(ii))

Update Despia / Xcode `Info.plist` `NSLocationWhenInUseUsageDescription` to the string in `docs/IOS_SETUP.md` (Friend Map example). Rebuild the native shell after changing plist.
