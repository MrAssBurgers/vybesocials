# App Store Review Notes (VYBE)

Paste into **App Store Connect → App Review Information → Notes** (and use the Reply draft below).

---

## Notes (paste into App Review Information)

```
Demo account: [fill email] / [fill password]
(Use the existing demo credentials already on file in App Store Connect if present — do not invent new passwords here.)

Start URL / build: Production web is https://vybehub.app (Despia App Start URL). Native Info.plist location purpose string requires a Despia/Xcode rebuild; web OTA alone does not change Info.plist.

LOCATION (5.1.1 ii)
Location is used for Friend Map while the user is in that feature (and related nearby social surfaces).
Example: on Friend Map, chosen friends can see you are “at the park.” Friend Link itself is QR-only (display / scan a code to add friends). Location is not used for advertising.
Purpose string (NSLocationWhenInUseUsageDescription): “VYBE uses your location while you use the app to power Friend Map. For example, when you open Friend Map, friends you choose can see that you are nearby (such as “at the park”). Location is not used for advertising or cross-app tracking.”

TRACKING / COOKIES (5.1.1 iv)
iOS uses App Tracking Transparency only. We do NOT show an in-app native cookie “Accept” banner after ATT.
If the reviewer selects Ask App Not to Track, the app stores essential-only consent and does not enable advertising/tracking cookies.
Essential signed-in session storage may still run so the account works (distinct from tracking cookies).

NFC (2.1)
This app no longer includes NFC. There is no Phone Tap / NFC hardware pairing, no NFC tag read/write UI, and Friend Link is QR-only.
No NFC accessory demo video is needed. If an older binary still declares NFC Tag Reading from a prior Despia capability, treat it as unused — capability will be removed on the next native rebuild.

AGE RATING — IN-APP CONTROLS (2.3.6)
Parental Controls and Age Assurance are both present in the app. Do not set either to None in App Store Connect.

HOW TO FIND PARENTAL CONTROLS
1. Sign in with the demo account (or any signed-in account).
2. Open Profile → Settings (gear / Settings).
3. Under Account, tap Parental Controls
   — or — Settings → Privacy → Parental Controls row at the bottom of Privacy & Security.
4. You will see “Set Up Parental Controls” (create a 4-digit PIN) or, if already enabled, a PIN unlock to manage:
   Controls Active, Daily Screen Time Limit, Content Filter Level, Who Can DM, Message Requests, DM Safety Filter, Quiet Hours, Take-a-Break Reminders.

HOW TO FIND AGE ASSURANCE
Age assurance = date-of-birth collection during onboarding, which drives age bands and safety defaults.
1. Create a new account (or use a fresh sign-up), complete auth, then reach onboarding step “When's your birthday?”
2. Enter Day / Month / Year. The app calculates age and applies protections:
   - Under 13: mandatory Parental Controls notice (PIN required path).
   - 13–15 / 16–17: enhanced / age-appropriate content notices.
3. Birthday is stored privately and used for filters (e.g. ads eligibility, DM safety, content filters) — not shown publicly by default.
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

VYBE **includes** Parental Controls and Age Assurance. Do **not** set either to **None**.

1. Open the app → **App Information** → Age Rating / Age Ratings → Edit
2. Under **In-App Controls**, select / claim **Parental Controls** (not None) — PIN-locked tools, screen time, content filters, safer DMs
3. Under **In-App Controls**, select / claim **Age Assurance** (not None) — date-of-birth age gate during onboarding that applies age-band safety
4. Save
5. Paste the **HOW TO FIND…** paths from Review Notes above so App Review can locate both features

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
We updated NSLocationWhenInUseUsageDescription to explain Friend Map with a concrete example. Example wording: “VYBE uses your location while you use the app to power Friend Map. For example, when you open Friend Map, friends you choose can see that you are nearby (such as “at the park”). Location is not used for advertising or cross-app tracking.” Friend Link is QR-only. Location is not used for advertising. This change ships with the updated native binary / Info.plist.

2) Guideline 5.1.1(iv) — Tracking / cookies after Ask App Not to Track
On iOS, App Tracking Transparency is the only tracking permission UI. We do not show a native cookie “Accept” banner after ATT. If Ask App Not to Track is selected, the app stays essential-only and does not enable advertising/tracking cookies. Essential session storage may remain so sign-in works; that is distinct from tracking cookies.

3) Guideline 2.1 — NFC
The app no longer includes NFC. Friend Link and referrals are QR / share-link only. There is no Phone Tap, NFC hardware pairing, or NFC tag UI. No NFC accessory demo video is needed. Any remaining NFC entitlement from an older binary should be treated as unused; we will remove the Despia NFC capability on the next native rebuild.

4) Guideline 2.3.6 — Age Rating / In-App Controls
Parental Controls and Age Assurance are both present in the app (claimed in App Store Connect — not set to None):

Parental Controls:
Sign in → Profile → Settings → Account → Parental Controls
(or Settings → Privacy → Parental Controls). Create a 4-digit PIN to enable screen-time limits, content filters, safer DMs, quiet hours, and break reminders.

Age Assurance:
Create a new account and complete onboarding step “When's your birthday?” (date of birth). The app calculates age and applies under-13 parental-control requirements and teen safety defaults.

Please let us know if anything else is needed.

Thank you,
[Your name]
```
