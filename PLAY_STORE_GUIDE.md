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

### Suggested Description

**Short description:**
```
Share moments, connect with friends & discover amazing content ✨
```

**Full description:**
```
Welcome to VYBE - The Next Generation Social Platform! 🌟

VYBE is where creativity meets connection. Share your moments through stunning photos, captivating videos, and engaging stories with your community.

✨ KEY FEATURES:

📸 STORIES & POSTS
Share your daily moments with beautiful filters and effects. Create photo posts, video clips, and stories that disappear after 24 hours.

💬 REAL-TIME MESSAGING
Chat with friends instantly. Send texts, photos, videos, voice messages, and more. Enjoy fun features like reactions, replies, and vanish mode.

🎥 SHORTS & CLIPS
Discover trending short-form videos from creators worldwide. Swipe through an endless feed of entertaining content.

📞 VIDEO & VOICE CALLS
Connect face-to-face with crystal-clear video calls. Group calls with up to 8 friends at once.

🏪 MARKETPLACE
Buy and sell within your community. List items, negotiate prices, and make transactions securely.

🎨 PERSONALIZATION
Express yourself with customizable themes, chat wallpapers, and unique profile styles. Make VYBE truly yours.

🔒 PRIVACY FIRST
Your data, your control. Choose who sees your content with granular privacy settings.

Join millions of users already vibing on VYBE! Download now and start connecting. 💫

#SocialMedia #Messaging #Stories #VideoChat #Community
```

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
