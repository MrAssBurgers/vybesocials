# App Store Review Notes (VYBE)

Paste into **App Store Connect → App Review Information → Notes** (and use the Reply draft below).

---

## Notes (paste into App Review Information)

```
Demo account: [fill email] / [fill password]

LOCATION (5.1.1 ii)
Location is used only for Friend Map and Friend Link while the user is in those features.
Example: on Friend Map, chosen friends can see you are “at the park”; on Friend Link / Phone Tap, phones find friends standing nearby to add them. Location is not used for advertising.

TRACKING / COOKIES (5.1.1 iv)
iOS uses App Tracking Transparency only. We do NOT show an in-app cookie “Accept” sheet after ATT.
If the reviewer selects Ask App Not to Track, the app stores essential-only consent and does not enable advertising/tracking cookies.
Essential signed-in session storage may still run so the account works.

NFC (2.1)
VYBE uses the phone’s built-in NFC to optionally read/write standard NFC tags and for Phone Tap friend sharing. There is NO separate third-party NFC accessory that must be paired.
Path: open app → Add Friends / Friend Link → Phone Tap (NFC) or QR.
If NFC Tag Reading is unavailable on the review device, use QR on the same sheet — same friend-add outcome.
Demo video: [paste public HTTPS link to screen recording on a physical iPhone showing Friend Link → Phone Tap NFC sheet and/or writing/reading an NFC sticker, plus QR fallback].

AGE RATING (2.3.6)
Parental Controls = None. Age Assurance = None. The app does not include those in-app control features.
```

---

## Despia / Xcode — location purpose string (REQUIRED rebuild)

In **Despia Editor → Info.plist / Permissions** (or Xcode `Info.plist`), set:

**NSLocationWhenInUseUsageDescription**

```
VYBE uses your location while you use the app to power Friend Map and Friend Link. For example, when you open Friend Map, friends you choose can see that you are nearby (such as “at the park”), and when you open Friend Link / Phone Tap your phone can find friends standing next to you so you can add them. Location is not used for advertising or cross-app tracking.
```

If Always is enabled for live map sharing, also set **NSLocationAlwaysAndWhenInUseUsageDescription** (see `docs/IOS_SETUP.md`).

Then **rebuild and submit a new binary** — OTA web publish alone does not change Info.plist purpose strings.

---

## Age Rating (App Store Connect — App Information)

1. Open the app → **App Information** → Age Rating / Age Ratings
2. Set **Parental Controls** → **None**
3. Set **Age Assurance** → **None**
4. Save

---

## NFC demo video (Guideline 2.1)

Apple asked for a physical-device video because the app declares NFC.

Film on a **physical iPhone** (not Simulator):

1. Open VYBE signed in with the demo account  
2. Open **Friend Link** → **Phone Tap** (system NFC sheet)  
3. Optionally tap a blank NFC sticker/tag if you have one (read or write)  
4. Show **QR** on the same sheet as the no-tag fallback  
5. Upload to an unlisted YouTube / iCloud / Dropbox link and paste into Review Notes

If you cannot film yet, still state clearly in Notes: no third-party NFC hardware accessory; NFC is optional phone/tag interaction; QR is the alternate path.

---

## Reply to App Review (paste into Resolution Center)

```
Hello App Review,

Thank you for the feedback on submission 74f32678-106f-4b6e-aaf4-4fc516abf279.

1) Guideline 5.1.1(ii) — Location purpose string
We updated NSLocationWhenInUseUsageDescription to explain Friend Map and Friend Link with a concrete example (e.g. friends see you “at the park”; Friend Link finds friends standing next to you). Location is not used for advertising. This requires the updated native binary with the new Info.plist string.

2) Guideline 5.1.1(iv) — Tracking / cookies after Ask App Not to Track
On iOS, App Tracking Transparency is the only tracking permission UI. We do not show a cookie “Accept” sheet after ATT. If Ask App Not to Track is selected, the app stays essential-only and does not enable advertising/tracking cookies. Essential session storage may remain so sign-in works.

3) Guideline 2.1 — NFC
VYBE uses the device’s built-in NFC for optional tag read/write and Phone Tap friend sharing. There is no separate designated NFC accessory to pair. Path: Friend Link → Phone Tap, or QR on the same screen. Demo video: [LINK]. Demo account: [USER] / [PASS].

4) Guideline 2.3.6 — Age Rating
We corrected Age Rating so Parental Controls and Age Assurance are both None. The app does not include those features.

Please let us know if anything else is needed.

Thank you,
[Your name]
```
