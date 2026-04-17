

## Make VYBE AdSense Policy Compliant

The app is already structurally in good shape: ads are disabled until approval (`ADS_ENABLED=false`), there's a tracking consent dialog gated behind login, content moderation runs Gemini safety scans server-side, under-13 users get parental controls, and the legal pages exist. Three concrete gaps need to be closed for Google Publisher Policies.

### Gap 1 — `ads.txt` is missing
Google's "Authorized inventory" policy requires `ads.txt` at the domain root once you publish ads. Add `public/ads.txt` containing:
```
google.com, pub-9952523729646293, DIRECT, f08c47fec0942fa0
```
Served at `https://vybehub.app/ads.txt`.

### Gap 2 — Privacy Policy doesn't disclose Google AdSense
Required by "Privacy disclosures" + "Identifying users" + "EU user consent" policies. Update `src/pages/Privacy.tsx`:
- Expand Section 04 (Data Sharing) to explicitly name **Google AdSense** as a third-party advertising partner that may set cookies, use web beacons, and read IP addresses.
- Expand Section 06 (Cookies) to mention third-party advertising cookies and link to Google's "How Google uses data" page (`https://policies.google.com/technologies/partner-sites`).
- Strengthen Section 09 (Children's Privacy) to state: users known to be under 13 are **excluded from personalized advertising** and ad requests for them are tagged for child-directed treatment per COPPA.
- Add a new short Section 11 — **Personalized Advertising & Your Choices** — describing AdChoices, opt-out via `https://www.aboutads.info/choices`, and that VYBE+ removes ads.

### Gap 3 — COPPA / under-13 ad tagging not wired
The app already knows a user's age. The `useShowAds` hook must additionally hide ads (and tag any future ad requests as child-directed) for under-13 accounts. Update `src/hooks/useShowAds.ts`:
- Pull user age via the existing profile/age helper.
- Return `showAds: false` when `age < 13`, regardless of premium/consent state.
- Add a `childDirected: boolean` flag the future `AdUnit` will use to set `data-tag-for-child-directed-treatment="1"` on the AdSense ins element when re-enabled.

### Bonus — small policy hardening already covered, just verifying
- ✅ Ads disabled globally (`ADS_ENABLED=false`) — no ads on empty/loading/camera screens.
- ✅ Tracking consent gated behind login and stored in DB.
- ✅ Server-side Gemini safety scan blocks sexual/violent/CSAM content.
- ✅ No deepfake generation, no escort/dating-for-pay features.
- ✅ Terms forbid illegal content, harassment, hate, and IP infringement (will verify wording).
- ✅ App is English-only (supported language).
- ✅ Not operated from sanctioned jurisdictions.

If `src/pages/Terms.tsx` is missing an explicit "no hate speech / no CSAM / no illegal content / no IP infringement / no deceptive content" clause when I open it during implementation, I'll add a single Prohibited Content section to cover Google's content policies.

### Files (3–4)
1. **New** `public/ads.txt` — authorized seller declaration
2. **Modify** `src/pages/Privacy.tsx` — AdSense + COPPA + AdChoices disclosures
3. **Modify** `src/hooks/useShowAds.ts` — under-13 ad suppression + childDirected flag
4. **Maybe modify** `src/pages/Terms.tsx` — add explicit Prohibited Content section if missing

No DB changes. No new packages. Ads stay off until you flip `ADS_ENABLED` after Google approves.

