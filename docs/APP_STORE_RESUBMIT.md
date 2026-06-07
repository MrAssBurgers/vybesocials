# App Store resubmit — rejection d15aac1f (1.0 build 5292359)

Apple flagged **two items**. This doc covers code fixes + what you must do in App Store Connect.

---

## 1. Guideline 2.1(a) — Blank screen after ATT

### Code fixes (in repo)

| Fix | File |
|-----|------|
| No duplicate in-app tracking dialog on native (Despia shows system ATT only) | `TrackingConsentDialog.tsx`, `att.ts` |
| WebView resume recovery after ATT / permission sheets | `attResumeRecovery.ts`, `main.tsx` |
| Splash dismiss waits for preloader + auth; polls after ATT resume | `App.tsx` |
| No blank `null` during auth on routes | `RootGate.tsx`, `PublicOnlyRoute.tsx`, `ProtectedRoute.tsx` |
| Stale session cleared instead of blank protected routes | `auth.tsx`, `ProtectedRoute.tsx` |

### Before you upload

1. **Delete the app** from test iPhone + iPad (fresh install).
2. Install the **new Despia build** (build number **> 5292359**).
3. Test **both** ATT paths:
   - Tap **Ask App Not to Track** → sign-in / home must appear (not blank).
   - Repeat with **Allow** → same.
4. Test on **iPad Air 11"** and **iPhone** (Apple’s review devices).

### App Review notes (paste into App Store Connect → App Review Information → Notes)

```
ATT / blank screen (Guideline 2.1a):
- iOS App Tracking Transparency is handled by the native Despia shell (system ATT only).
- We removed the duplicate in-app tracking dialog that could stack with the system sheet.
- WebView resume recovery clears stuck splash/scroll locks after ATT allow/deny.
- Splash dismiss is gated on auth + preload completion, with post-ATT polling.

Test: Fresh install → complete ATT (Allow OR Don't Allow) → app shows sign-in or home feed, not a blank screen.
Demo account: [YOUR_USERNAME] / [YOUR_PASSWORD]
```

Replace demo credentials with a real reviewer account.

---

## 2. Guideline 2.1 — NFC demo video

This is **not fixed in code**. Apple needs a **video link** in App Review Information.

### What to film (60–90 seconds)

Use a **physical iPhone or iPad** (not Simulator). Frame both the **device screen** and **NFC interaction** where possible.

| Step | Action | On screen |
|------|--------|-----------|
| 1 | Open VYBE | App loads past splash |
| 2 | Sign in with demo account | Home feed |
| 3 | Activate **Friend Link** | Shake phone OR tap the Friend Link pill/coach on Home |
| 4 | Friend Link sheet opens | QR + NFC options visible |
| 5 | **NFC tap** | Hold two iPhones back-to-back (tops aligned) OR tap an NFC tag programmed with a VYBE friend payload |
| 6 | Success | Friend added toast / confirmation |

**Second phone (optional but strong):** Show reverse tap so reviewers see bidirectional NFC.

Upload to YouTube (unlisted) or Vimeo and paste the URL in **App Review Information → Notes**.

### App Review notes for NFC (paste alongside ATT notes)

```
NFC demo video: [PASTE VIDEO URL HERE]

NFC feature — Friend Link:
1. Sign in with demo account above.
2. On Home, shake the device or tap the Friend Link pill to open Friend Link.
3. Tap another iPhone running VYBE (back-to-back, top edge) to exchange and add a friend via NFC.
4. Alternative: scan the QR code in the same sheet.

NFC is used for peer-to-peer friend adds (Friend Link), not payment or external hardware pairing.
iOS: Core NFC via Despia native bridge. Usage string: "VYBE uses NFC so you can tap to add friends."
```

### Native checklist (Despia rebuild)

- NFC capability enabled in Xcode / Despia project
- `NFCReaderUsageDescription` in Info.plist (see `docs/NATIVE_AUTH_SETUP.md`)
- New binary uploaded to App Store Connect

---

## Release steps

1. Commit + push `main`
2. **Lovable → Share → Publish** (web assets)
3. **Despia rebuild** → upload to App Store Connect
4. Add **Notes + NFC video URL + demo account** in App Review Information
5. **Reply** to Apple’s message in App Store Connect with: *“ATT blank screen fixed in build [X]. NFC demo video: [URL]. Demo account provided in notes.”*
6. Submit for review

---

## Submission ID reference

- **Submission ID:** d15aac1f-4821-4c59-8d14-712aa55dfb50
- **Rejected build:** 1.0 (5292359)
- **Review devices:** iPad Air 11-inch (M3), iPhone 17 Pro Max, iOS/iPadOS 26.4.2
