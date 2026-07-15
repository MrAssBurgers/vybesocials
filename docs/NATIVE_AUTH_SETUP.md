# VYBE Native Auth Setup (Despia + Capacitor)

Production passkeys, NFC, and deep links require a few values that only YOU
can produce — they come from Google Play Console, Apple Developer, and
Despia. This doc lists exactly what to fill in and where.

## 1. Production domain

WebAuthn / passkeys are bound to **`vybehub.app`** in
`supabase/functions/_shared/passkey-rp.ts`. If you change the production
domain, update that file's `PROD_RP_ID` and `PROD_ORIGINS` arrays.

## 2. Android Digital Asset Links (passkey + app-link binding)

File: `public/.well-known/assetlinks.json`

The Despia (`com.despia.vybe`) SHA-256 is filled in:
`DE:E3:B6:4D:4D:93:39:A1:74:E2:34:6C:A6:38:61:42:AC:DA:E4:07:24:0F:5A:97:AC:E2:26:07:B9:DE:59:E5`

Only the Despia block + `web` entry are shipped (VYBE distributes via
Despia only — no separate Capacitor Android build).

After deploy, verify with:
```
curl https://vybehub.app/.well-known/assetlinks.json
```
Google's tester: <https://developers.google.com/digital-asset-links/tools/generator>

## 3. iOS Apple App Site Association (passkey + universal links)

File: `public/.well-known/apple-app-site-association`

Replace `TEAMID` with your **Apple Team ID** (developer.apple.com →
Membership). The `appIDs` entry must be `<TEAMID>.<bundle-id>`.

For the Despia iOS build the bundle ID is provided by Despia — ask their
support for it. For a Capacitor build the default is
`app.lovable.416714c8d0134aff984d522418a9bbc7`.

You can ship multiple app IDs:
```json
"appIDs": [
  "ABCD1234.app.lovable.416714c8d0134aff984d522418a9bbc7",
  "ABCD1234.com.despia.vybe"
]
```

## 4. Despia bridge schemes

VYBE expects Despia to expose these native bridge URL schemes:

| Feature             | Scheme                          | File                           |
|---------------------|---------------------------------|--------------------------------|
| Passkey biometric   | `biometric://authenticate`      | `src/lib/despiaVault.ts`       |
| Storage Vault       | `setvault://`, `readvault://`   | `src/lib/despiaVault.ts`       |
| NFC read            | `nfcread://` / `scannfc://`     | `src/hooks/useNFC.ts`          |
| Open app settings   | `appsettings://`                | `src/lib/despiaBridge.ts`      |
| Interstitial ad     | `displayinterstitialad://`      | `src/hooks/useVideoAds.ts`     |
| In-app purchase     | `revenuecat://purchase`         | `src/hooks/useRevenueCat.ts`   |
| Google OAuth        | `oauth://?url=...`              | `src/lib/despiaOAuth.ts`       |
| Apple (Android)     | `oauth://?url=...`              | `src/lib/despiaOAuth.ts`       |
| Apple (iOS)         | Apple JS SDK native sheet       | `src/lib/appleSignIn.ts`       |

### Social login UX (Despia store builds)

Google **cannot** run inside the WKWebView (provider policy). The supported
big-app pattern is a **system account sheet**:

| Provider | Platform | UX |
|----------|----------|-----|
| Google | iOS / Android | `oauth://` → ASWebAuthenticationSession / Custom Tabs → silent `native-callback.html` → `com.despia.vybe://oauth/auth?hc=…` |
| Apple | iOS | Apple JS SDK `usePopup: true` → Face ID / Continue sheet → `signInWithCredential` in-app |
| Apple | Android | Same `oauth://` handoff as Google (`hc=` stash/redeem) |

**Silent callback:** `https://vybehub.app/native-callback.html` must bounce
immediately with a short `hc=` code (never put JWTs in the deeplink — iOS
rejects long custom-scheme URLs as “address is invalid”). Fallback “Open VYBE”
appears only after ~1.5s if the app did not reclaim the session.

**Landing:** shows an in-app “Continue with Google/Apple…” overlay while the
system sheet is open; profile auto-link via `claim_profile_by_email` after success.

**Firebase Console:** keep **one account per email** enabled so Google/Apple
sign-in merges with an existing email/password user when possible. Conflicts
surface Settings → Connections guidance.

**Publish gate:** Despia always returns to **prod** `vybehub.app/native-callback.html`.
After changing that file or the redeem client, **Lovable → Share → Publish** so
production matches staging (`vybe-daaab.web.app` alone is not enough for OAuth return).

**Google Cloud Console** (OAuth 2.0 Web client for Firebase): add authorized
redirect URI:

```
https://vybehub.app/native-callback.html
```

Optional env overrides (see `.env.example`):

- `VITE_DESPIA_DEEPLINK_SCHEME=com.despia.vybe` — must match Despia app scheme
- `VITE_FIREBASE_GOOGLE_WEB_CLIENT_ID` — Firebase web client ID (defaults to value in `native/android/google-services.json`)

Confirm with Despia support that `oauth://` is enabled for the
`com.despia.vybe` (Android) and the iOS bundle they assigned you.

## 5. NFC native permissions

### Android — add to `AndroidManifest.xml`

Canonical reference: **`native/android/AndroidManifest.xml`** in this repo.

```xml
<uses-permission android:name="android.permission.NFC" />
<uses-feature android:name="android.hardware.nfc" android:required="false" />
```
For Capacitor builds this lives in `android/app/src/main/AndroidManifest.xml`.
For Despia, confirm these lines are in the manifest **and** NFC addon is ON in the Despia Editor, then publish a **new store build** (OTA web updates cannot add manifest permissions).

### iOS — add to `Info.plist`
```xml
<key>NFCReaderUsageDescription</key>
<string>VYBE uses NFC so you can tap to add friends and unlock perks.</string>
```
Plus enable the **Near Field Communication Tag Reading** capability in
Xcode → Signing & Capabilities. For Despia, ask their support to enable it.

## 6. Environment variables (web)

See `.env.example`. The two passkey RP-related vars are documentation only
— the source of truth is the edge function (`PROD_RP_ID`).

## Final checklist of values you still owe

- [x] **Android SHA-256 fingerprint** for `com.despia.vybe` ✅ (`DE:E3:B6:4D:...:59:E5`)
- [ ] **Apple Team ID**
- [ ] **iOS bundle ID** (from Despia or Capacitor)
- [ ] Confirm Despia bridges listed above are enabled for your build
- [ ] Confirm `RESEND_API_KEY` and (optional) `RESEND_FROM_EMAIL` are set
      in Lovable Cloud → Backend → Secrets, and the sender domain is
      verified in Resend
