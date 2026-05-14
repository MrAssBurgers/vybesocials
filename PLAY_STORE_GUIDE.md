# VYBE - Google Play Store Deployment Guide

## 🎉 Your app is ready for Google Play Store!

This guide will walk you through publishing VYBE to the Google Play Store.

## Prerequisites

Before you begin, make sure you have:
- [ ] A Google Play Developer account ($25 one-time fee) - [Sign up here](https://play.google.com/console/)
- [ ] Android Studio installed on your computer
- [ ] Java 17+ installed
- [ ] Git installed

## Step 1: Export to GitHub

1. In Lovable, click the **Settings** icon
2. Go to **GitHub** tab under Connectors
3. Click **Export to GitHub**
4. Create a new repository named `vybe-app`

## Step 2: Clone and Setup

```bash
# Clone your repository
git clone https://github.com/YOUR_USERNAME/vybe-app.git
cd vybe-app

# Install dependencies
npm install

# Add Android platform
npx cap add android

# Build the web app
npm run build

# Sync with Android
npx cap sync android
```

## Step 3: Configure for Release

### Generate a Signing Key
```bash
keytool -genkey -v -keystore vybe-release-key.keystore -alias vybe -keyalg RSA -keysize 2048 -validity 10000
```

⚠️ **IMPORTANT**: Save this keystore file and remember your passwords! You cannot update your app without them.

### Create `android/keystore.properties`
```properties
storePassword=YOUR_KEYSTORE_PASSWORD
keyPassword=YOUR_KEY_PASSWORD
keyAlias=vybe
storeFile=../vybe-release-key.keystore
```

### Update `android/app/build.gradle`
Add this inside the `android` block:
```gradle
signingConfigs {
    release {
        def keystorePropertiesFile = rootProject.file("keystore.properties")
        def keystoreProperties = new Properties()
        keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
        
        keyAlias keystoreProperties['keyAlias']
        keyPassword keystoreProperties['keyPassword']
        storeFile file(keystoreProperties['storeFile'])
        storePassword keystoreProperties['storePassword']
    }
}

buildTypes {
    release {
        signingConfig signingConfigs.release
        minifyEnabled true
        proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
    }
}
```

## Step 4: Build Release APK/AAB

```bash
# Open Android Studio
npx cap open android

# Or build from command line
cd android
./gradlew bundleRelease
```

The signed AAB will be at: `android/app/build/outputs/bundle/release/app-release.aab`

## Step 5: Create Play Store Listing

### Required Assets
- [x] App icons (already generated in `/public/icons/`)
- [ ] Feature graphic (1024x500 PNG)
- [ ] Screenshots (min 2, recommended 8)
  - Phone: 1080x1920 or 1920x1080
  - Tablet (optional): 1200x1920
- [ ] Short description (max 80 characters)
- [ ] Full description (max 4000 characters)

### Suggested Description (ASO-optimized)

**App title (max 30 chars):**
```
VYBE: Social, Chat & Clips
```

**Short description (max 80 chars — keyword-rich, 64 chars):**
```
Stories, clips, chat, calls & communities — make your VYBE.
```

**Full description (≤4000 chars, front-loaded for the "Read more" cutoff):**

The first ~250 chars are what shows on the listing before users tap "Read more" — they sell the install:

```
VYBE is a social app for stories, short videos, group chats, voice & video
calls, and communities. Share moments, message friends, drop into live
Spaces, customize your profile, and discover content that actually matches
your vibe.

✨ TOP FEATURES

📸 Stories, Posts & Clips
Share photos, short videos, and 24-hour stories with filters, music and AI
effects. Endless feed of trending clips.

💬 Messaging, Voice & Video Calls
DMs, group chats, voice notes, HD video calls. Reactions, replies, GIFs,
stickers, disappearing messages.

👥 Communities & Live Spaces
Find your people. Join communities, drop into live audio Spaces, meet new
friends through Friend Map and VYBE Roulette.

🎨 Themes & Personalization
Custom themes, chat wallpapers, profile layouts, and an AI that reshapes
your feed and home screen to match your real-life vibe.

🏆 Earn & Level Up
Daily streaks, XP, badges and seasonal drops — the more you VYBE, the more
you unlock.

🛍 Marketplace & Creator Tools
Sell to your community, support creators with tips, and unlock monetization
as you grow.

🔒 Privacy & Safety First
Granular privacy controls, parental tools, in-app reporting, and content
filters keep VYBE a safe place to be yourself.

Join the next generation of social. Download VYBE and start your vibe today.

KEYWORDS: social media app, messaging app, video chat, stories, short videos,
clips, community, social network, friends app, group chat, voice calls,
video calls, themes, creator tools, social platform.

#SocialMedia #Messaging #Stories #ShortVideos #Communities #VideoChat
```

### Localized listing stubs (top markets)

Add these in the Play Console under **Store presence → Main store listing → Manage translations**:

| Locale | Title (≤30) | Short description (≤80) |
|---|---|---|
| en-US | `VYBE: Social, Chat & Clips` | `Stories, clips, chat, calls & communities — make your VYBE.` |
| es-ES | `VYBE: Social, Chat y Clips` | `Historias, clips, chats, llamadas y comunidades — vive tu VYBE.` |
| pt-BR | `VYBE: Social, Chat e Clipes` | `Histórias, clipes, chat, chamadas e comunidades — viva seu VYBE.` |
| id-ID | `VYBE: Sosial, Chat & Clips` | `Cerita, klip, chat, panggilan & komunitas — buat VYBE-mu.` |
| fr-FR | `VYBE: Social, Chat & Clips` | `Stories, clips, chat, appels et communautés — vis ta VYBE.` |

For full descriptions, translate the English block above with the same bullet structure — Play Store ranks emoji-led bullets well in non-English markets too.

### Screenshot Plan (8 phone screenshots — feature-focused)

Each screenshot is **1080×1920** with a bold overlay headline + 1-line subtitle.
The first **3** drive the install (only ones most users see in search results) — make those the strongest:

1. **★ ABOVE THE FOLD — "Your social home"** — Home feed with stories rail and a vibrant post.
2. **★ ABOVE THE FOLD — "Endless clips"** — Vertical Clips feed with engagement bar visible.
3. **★ ABOVE THE FOLD — "Chat without limits"** — DM thread showing reactions, GIFs and a voice note.
4. **"Share your VYBE"** — Camera/Stories editor with a creative effect.
5. **"Calls with your people"** — Group video call screen with avatars.
6. **"Find your community"** — Communities/Spaces discovery screen.
7. **"Make it yours"** — Theme customizer / profile customization screen.
8. **"Safe by default"** — Privacy & parental controls screen.

Tips:
- Same overlay style across all 8 (consistent font, gradient, position).
- Localize captions for top markets (EN, ES, PT, ID, FR) when possible.
- See `scripts/capture-store-screenshots.md` for an exact route + capture runbook.

### Feature Graphic (1024×500)
Headline: "Make your VYBE." with the VYBE wordmark on the brand gradient.



## Step 6: Upload to Play Console

1. Go to [Google Play Console](https://play.google.com/console/)
2. Click **Create app**
3. Fill in app details:
   - App name: **VYBE**
   - Default language: English (US)
   - App or game: App
   - Free or paid: Free
4. Complete the content rating questionnaire
5. Set up your store listing with the description above
6. Upload your screenshots and graphics
7. Go to **Production** → **Create new release**
8. Upload your `.aab` file
9. Review and roll out!

## Step 7: Testing (Optional but Recommended)

### Internal Testing
1. Go to **Testing** → **Internal testing**
2. Create a release with your AAB
3. Add up to 100 internal testers
4. Get feedback before production release

### Open Testing (Beta)
1. After internal testing, create an **Open testing** track
2. This allows anyone to join your beta
3. Great for gathering broader feedback

## App Bundle ID
```
app.lovable.762a689eac3b48a59a179f1c2b5b3a2b
```

## Troubleshooting

### App crashes on launch
- Make sure you ran `npm run build` before `npx cap sync`
- Check that the server URL in `capacitor.config.ts` is correct

### Build fails
- Ensure Java 17+ is installed: `java -version`
- Try: `cd android && ./gradlew clean`

### Icons not showing
- Run: `npx cap sync android` after adding icons

## Need Help?

Check the official documentation:
- [Capacitor Android Docs](https://capacitorjs.com/docs/android)
- [Google Play Console Help](https://support.google.com/googleplay/android-developer)

---

Good luck with your launch! 🚀
