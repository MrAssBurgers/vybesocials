
The user wants permission/consent prompts to only ask once and then remember the choice forever (across devices and sessions). Let me audit the consent prompts in the app.

From the files I've already seen:
1. **CrashReportConsent** (`src/components/error/CrashReportConsent.tsx`) — already saves to `localStorage` AND DB (`profiles.crash_consent`). Good pattern.
2. **TrackingConsentDialog** (`src/components/app/TrackingConsentDialog.tsx`) — already saves to `localStorage` AND DB (`profiles.tracking_consent`). Good pattern.
3. **CookieConsentBanner** (`src/components/legal/CookieConsentBanner.tsx`) — only saves to `localStorage`. Resets if user clears browser data or switches devices.

Let me check what other permission prompts exist (camera, mic, location, contacts, notifications) to see which are re-prompting unnecessarily.
