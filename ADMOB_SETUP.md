# AdMob Setup — VYBE (Despia Native)

VYBE does **not** use `@capacitor-community/admob`. All native ads run through the
**Despia bridge** (`despia-native`). AdMob App ID and unit IDs are configured in the
**Despia project dashboard**, not in this repo.

## Despia dashboard (required)

1. Open your Despia project → **Monetization / AdMob**.
2. Paste your AdMob IDs:

| Field | Android value |
|-------|----------------|
| **App ID** | `ca-app-pub-9952523729646293~519155087` |
| **Rewarded** | `ca-app-pub-9952523729646293/962472048` |

3. Save and **rebuild the native app** in Despia (OTA web publish alone does not update AdMob config).

Reference copy in code: `DESPIA_ADMOB_IDS` in `src/lib/despiaRewardedAds.ts`.

## How ads are triggered in the web app

| Ad type | Bridge URL | Used for |
|---------|------------|----------|
| Rewarded | `displayrewardedad://` | Token Wallet → Watch & Earn |
| Interstitial | `displayinterstitialad://` | Feed / clips natural breaks |
| Banner | `displaybannerad://` | Optional placements |
| Hide banner | `hidebannerad://` | Cleanup |

Rewarded completion callback:

```ts
window.updateRewardedStatus('true');  // user earned reward
window.updateRewardedStatus('false'); // dismissed / no reward
```

Implementation: `src/lib/despiaRewardedAds.ts`, `src/hooks/useRewardedAd.ts`, `src/lib/admob.ts`.

## Eligibility (who sees ads)

- **Premium (RevenueCat `Vybe Social Pro`)** — no ads.
- **Under 13 (COPPA)** — no ads.
- **ATT “Don’t Allow”** — ads still show (non-personalized).

Use `useAdEligibility()` / `useShowAds()` in UI; do **not** use `usePremiumStatus().isPremium` for ad gates.

## Verify Watch & Earn

1. Open the app in a **Despia build** (not Safari / web preview).
2. Go to **Wallet** → tap **Watch ad**.
3. Complete the video; you should see `+25 VYBE Tokens` (or 2× with boost).
4. If the button stays disabled on Despia, check RevenueCat premium status and DOB in profile.

## Docs

- [Despia rewarded ads](https://setup.despia.com/native-features/admob/rewarded-ads.md)
- [Despia deployment](https://setup.despia.com/deployment/google-android/automatic.md)
