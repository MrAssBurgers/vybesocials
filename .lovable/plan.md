## Plan

Since VYBE ships only through Despia (not a separate Capacitor build), the second `assetlinks.json` block for `app.lovable.416714c8d0134aff984d522418a9bbc7` with its `REPLACE_WITH_PLAY_APP_SIGNING_SHA256` placeholder is dead weight — and Google's Digital Asset Links verifier will fail on the placeholder string.

### Changes

1. **`public/.well-known/assetlinks.json`** — Remove the second object (the Capacitor `app.lovable.*` block). Keep:
   - The Despia Android block (`com.despia.vybe` with your real SHA-256)
   - The `web` block for `https://vybehub.app`

2. **`docs/NATIVE_AUTH_SETUP.md`** — Update section 2 to remove the mention of the Capacitor placeholder, and remove the "Android SHA-256 for any Capacitor variant" line from the checklist.

### After this change, you need to:

1. Click **Publish** to push the updated `assetlinks.json` to `https://vybehub.app/.well-known/assetlinks.json`.
2. Re-run `curl -s https://vybehub.app/.well-known/assetlinks.json` — it should now contain only your real SHA-256 and the web entry, no placeholders.
3. Verify via Google's tester with `vybehub.app` + `com.despia.vybe` + your fingerprint.

### Still outstanding (separate follow-up, not part of this plan)
- Apple Team ID + iOS bundle ID for `apple-app-site-association`
- Confirmation from Despia that `biometric://`, `nfcread://`, `appsettings://` bridges are enabled
- `RESEND_API_KEY` set in Lovable Cloud secrets with verified sender domain
