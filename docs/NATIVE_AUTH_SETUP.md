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

Replace `REPLACE_WITH_DESPIA_PLAY_APP_SIGNING_SHA256` with the SHA-256 cert
fingerprint of the **Despia-built** Android app:

1. Google Play Console → your app → **Setup → App signing**
2. Copy the value under **App signing key certificate → SHA-256**
3. Paste it into `assetlinks.json` (uppercase, colon-separated, e.g.
   `12:AB:CD:...`).

Also replace `REPLACE_WITH_PLAY_APP_SIGNING_SHA256` with the SHA-256 of any
Capacitor-built variant if you ship that separately.

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

Confirm with Despia support that ALL of these are enabled for the
`com.despia.vybe` (Android) and the iOS bundle they assigned you. If any
are missing, the corresponding feature falls back to the web path or shows
an "unavailable" message.

## 5. NFC native permissions

### Android — add to `AndroidManifest.xml`
```xml
<uses-permission android:name="android.permission.NFC" />
<uses-feature android:name="android.hardware.nfc" android:required="false" />
```
For Capacitor builds this lives in `android/app/src/main/AndroidManifest.xml`.
For Despia, ask Despia support to add these to the manifest.

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

- [ ] **Android SHA-256 fingerprint** for `com.despia.vybe`
- [ ] **Android SHA-256 fingerprint** for any Capacitor variant (optional)
- [ ] **Apple Team ID**
- [ ] **iOS bundle ID** (from Despia or Capacitor)
- [ ] Confirm Despia bridges listed above are enabled for your build
- [ ] Confirm `RESEND_API_KEY` and (optional) `RESEND_FROM_EMAIL` are set
      in Lovable Cloud → Backend → Secrets, and the sender domain is
      verified in Resend
