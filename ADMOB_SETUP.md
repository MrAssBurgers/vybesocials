# AdMob Setup Guide — Vybe Studios

The `@capacitor-community/admob` plugin is installed and initialized in `src/main.tsx`.
Test ads will work out of the box. Follow these steps to ship real ads.

## 1. Create your AdMob account
1. Sign up at https://apps.admob.com
2. Click **Apps → Add App** → "Yes, my app is published" or "No" → choose **Android**
3. Copy your **App ID** (looks like `ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY`)
4. Create ad units (Banner, Interstitial, Rewarded) and copy each **Ad Unit ID**

## 2. Plug your IDs into the app
Edit `src/lib/admob.ts`:
```ts
const USE_TEST_ADS = false; // ← flip to false

export const AD_UNIT_IDS = {
  banner:       'ca-app-pub-XXXX/XXXX',
  interstitial: 'ca-app-pub-XXXX/XXXX',
  rewarded:     'ca-app-pub-XXXX/XXXX',
};
```

## 3. Add your AdMob App ID to AndroidManifest.xml
After running `npx cap add android`, open `android/app/src/main/AndroidManifest.xml`
and add this **inside `<application>`** (REQUIRED — app crashes without it):

```xml
<meta-data
    android:name="com.google.android.gms.ads.APPLICATION_ID"
    android:value="ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY"/>
```

While testing, you can use Google's sample App ID:
`ca-app-pub-3940256099942544~3347511713`

## 4. (iOS) Add to Info.plist
After `npx cap add ios`, in `ios/App/App/Info.plist`:
```xml
<key>GADApplicationIdentifier</key>
<string>ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY</string>
<key>SKAdNetworkItems</key>
<array>
  <dict>
    <key>SKAdNetworkIdentifier</key>
    <string>cstr6suwn9.skadnetwork</string>
  </dict>
</array>
```

## 5. Sync & build
```bash
npm run build
npx cap sync android
npx cap open android
```

## 6. Show ads in your code
```ts
import { showBanner, showInterstitial, showRewarded } from '@/lib/admob';

// Banner at bottom of screen
await showBanner();

// Full-screen ad at natural break
await showInterstitial();

// Rewarded video — returns reward info
const reward = await showRewarded();
if (reward) console.log(`Earned ${reward.amount} ${reward.type}`);
```

## Notes
- Banner/interstitial/rewarded helpers are no-ops on web — safe to call anywhere.
- Premium users should be skipped — wrap calls with `useShowAds()` from `src/hooks/useShowAds.ts`.
- The plugin auto-handles GDPR consent on first launch in EEA.
