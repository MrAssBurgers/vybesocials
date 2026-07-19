# App Store Review Notes (VYBE)

Paste into **App Store Connect → App Review Information → Notes** (and use the Reply draft below).

---

## Notes (paste into App Review Information)

```
Demo account: [fill email] / [fill password]

LOCATION (5.1.1 ii)
Location is used for Friend Map while the user is in that feature (and related nearby social surfaces).
Example: on Friend Map, chosen friends can see you are “at the park.” Friend Link itself is QR-only (display / scan a code to add friends). Location is not used for advertising.

TRACKING / COOKIES (5.1.1 iv)
iOS uses App Tracking Transparency only. We do NOT show an in-app cookie “Accept” sheet after ATT.
If the reviewer selects Ask App Not to Track, the app stores essential-only consent and does not enable advertising/tracking cookies.
Essential signed-in session storage may still run so the account works.

NFC
This build does NOT use NFC. There is no Phone Tap / NFC friend-add path, no NFC tag read/write UI, and Friend Link is QR-only.
If the binary still declares NFC Tag Reading from an older Despia capability, treat it as unused — please ignore NFC accessory/demo requests for this submission. Capability will be removed on the next native rebuild.

AGE RATING (2.3.6)
Parental Controls = None. Age Assurance = None. The app does not include those in-app control features.
```

---

## Despia / Xcode — location purpose string (REQUIRED rebuild)

In **Despia Editor → Info.plist / Permissions** (or Xcode `Info.plist`), set:

**NSLocationWhenInUseUsageDescription**

```
VYBE uses your location while you use the app to power Friend Map. For example, when you open Friend Map, friends you choose can see that you are nearby (such as “at the park”). Location is not used for advertising or cross-app tracking.
```

If Always is enabled for live map sharing, also set **NSLocationAlwaysAndWhenInUseUsageDescription** (see `docs/IOS_SETUP.md`).

### NFC capability — turn OFF on next native rebuild

In **Despia Editor**:
1. Disable the **NFC** addon / capability (do not ship `NFCReaderUsageDescription` or Core NFC entitlement for this release).
2. Rebuild the store binary so Info.plist no longer advertises NFC Tag Reading.
3. OTA web publish alone cannot remove Info.plist NFC strings — native rebuild required.

Then **rebuild and submit a new binary** — OTA web publish alone does not change Info.plist purpose strings.

---

## Age Rating (App Store Connect — App Information)

1. Open the app → **App Information** → Age Rating / Age Ratings
2. Set **Parental Controls** → **None**
3. Set **Age Assurance** → **None**
4. Save

---

## Friend Link demo (QR only)

Film on a **physical iPhone** (not Simulator):

1. Open VYBE signed in with the demo account  
2. Open **Friend Link** → show your QR code  
3. Scan another demo user’s QR (or `/friend-drop/...` / `/add-friend/...` deep link)  
4. Confirm both accounts become friends  

No NFC / Phone Tap demo is needed for this submission.

---

## Reply to App Review (paste into Resolution Center)

```
Hello App Review,

Thank you for the feedback on submission 74f32678-106f-4b6e-aaf4-4fc516abf279.

1) Guideline 5.1.1(ii) — Location purpose string
We updated NSLocationWhenInUseUsageDescription to explain Friend Map with a concrete example (e.g. friends see you “at the park”). Friend Link is QR-only. Location is not used for advertising. This requires the updated native binary with the new Info.plist string.

2) Guideline 5.1.1(iv) — Tracking / cookies after Ask App Not to Track
On iOS, App Tracking Transparency is the only tracking permission UI. We do not show a cookie “Accept” sheet after ATT. If Ask App Not to Track is selected, the app stays essential-only and does not enable advertising/tracking cookies. Essential session storage may remain so sign-in works.

3) Guideline 2.1 — NFC
This build does not use NFC. Friend Link and referrals are QR / share-link only. There is no Phone Tap or NFC tag UI. Any remaining NFC entitlement from an older binary should be treated as unused; we will remove the Despia NFC capability on the next native rebuild.

4) Guideline 2.3.6 — Age Rating
We corrected Age Rating so Parental Controls and Age Assurance are both None. The app does not include those features.

Please let us know if anything else is needed.

Thank you,
[Your name]
```
