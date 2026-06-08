# App Store resubmit — VYBE iOS

Apple rejection history and resubmit checklist. Latest: **1.2.2 (6061901)** — iPad blank launch.

---

## Latest rejection — 1.2.2 build 6061901 (June 7, 2026)

**Guideline 2.1(a)** — “App failed to load any content at launch”  
**Device:** iPad Air 11-inch (M3), iPadOS 26.5

### Root cause (code)

On iPad, the app could route to the **desktop marketing site** (`VybeHome`) instead of the mobile sign-in/home experience. iPads report as `Macintosh` in the user agent, so native-shell detection and the old `768px` breakpoint missed them — especially in landscape.

### Fixes (in repo)

| Fix | File |
|-----|------|
| iPad / touch device detection (`detectIsIPad`, embedded WebView) | `deviceDetection.ts`, `despiaBridge.ts` |
| `/` always opens Landing/intro on iPad & native (never desktop marketing) | `RootGate.tsx` |
| Marketing routes redirect iPad to `/auth` | `PublicOnlyRoute.tsx` |
| Auth init safety timeout + `getSession` race (never hang on launch) | `auth.tsx` |
| Clear stuck `#root` visibility after splash dismiss | `App.tsx` |

### App Review notes (paste for build **> 6061901**)

```
Launch / blank screen (Guideline 2.1a, iPad):
- Fixed iPad routing: App Store builds now open the mobile sign-in screen (not the desktop marketing website).
- Improved native WebView detection for iPadOS desktop-class user agents.
- Auth/session restore has a 6s safety timeout so launch never hangs indefinitely.
- Splash always dismisses within 6.5s; UI remains visible after ATT.

Test on iPad Air (fresh install):
1. Delete app → reinstall → complete ATT (Allow or Don't Allow).
2. Swipe through intro (or tap Skip) → Sign In screen with VYBE branding appears.
3. Sign in with demo account → Home feed with posts or empty-state (“Nothing here yet”), bottom nav visible.

Demo account: [YOUR_EMAIL] / [YOUR_PASSWORD]
```

---

## Prior rejection — 1.0 build 5292359 (ATT blank screen)

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
2. Install the **new Despia build** (build number **> 6061901**).
3. Test **both** ATT paths:
   - Tap **Ask App Not to Track** → sign-in / home must appear (not blank).
   - Repeat with **Allow** → same.
4. Test on **iPad Air 11"** (portrait **and landscape**) and **iPhone**.

### App Review notes (ATT — include with launch notes above)

```
ATT: System ATT only (Despia native). No duplicate in-app tracking dialog.
WebView resume recovery after permission sheets. Splash dismiss gated on auth + preload.
```

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

- **Latest rejected build:** 1.2.2 (6061901) — iPad launch blank
- **Prior rejected build:** 1.0 (5292359) — ATT blank screen
- **Review devices:** iPad Air 11-inch (M3), iPhone 17 Pro Max
