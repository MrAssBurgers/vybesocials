## Plan: Wire Android SHA-256 into Digital Asset Links

You provided the Play App Signing SHA-256 for `com.despia.vybe`:
`DE:E3:B6:4D:4D:93:39:A1:74:E2:34:6C:A6:38:61:42:AC:DA:E4:07:24:0F:5A:97:AC:E2:26:07:B9:DE:59:E5`

I'll drop it into the production asset-links file so Android passkeys and app-link binding actually verify against your published build.

### Changes

1. **`public/.well-known/assetlinks.json`**
   - Replace `REPLACE_WITH_DESPIA_PLAY_APP_SIGNING_SHA256` (under `com.despia.vybe`) with the fingerprint above.
   - Leave the second Capacitor block (`app.lovable.416714c8d0134aff984d522418a9bbc7`) with its placeholder — you only need that one if you ship a non-Despia Capacitor build. I'll add a short comment-style note in the docs about it.

2. **`docs/NATIVE_AUTH_SETUP.md`**
   - Mark the Android SHA-256 checklist item as filled in.
   - Update section 2 to reflect that the Despia fingerprint is now hardcoded.

### Still outstanding (not blocking this change)

- Apple Team ID + iOS bundle ID for `apple-app-site-association`
- Confirmation that `https://vybehub.app/.well-known/assetlinks.json` is reachable after deploy (Android's verifier fetches it over HTTPS — no redirects, `Content-Type: application/json`)
- Despia support confirming `biometric://`, `nfcread://`, `appsettings://` schemes are enabled for the `com.despia.vybe` build

### Verification after deploy

```
curl -sI https://vybehub.app/.well-known/assetlinks.json
curl -s  https://vybehub.app/.well-known/assetlinks.json | jq .
```
Then run Google's tester: https://developers.google.com/digital-asset-links/tools/generator with `vybehub.app` + `com.despia.vybe` + the fingerprint.
