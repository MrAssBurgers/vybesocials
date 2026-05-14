## Goal

Close the gap between VYBE's current messaging stack and Google's "Best messaging app" tier, focused on what actually moves the needle in a Capacitor Android Play Store build.

## What you already have (skip)

From memory + DB inspection:
- Reactions (multi-emoji, swipe reply, persistence) ✓
- AES-256 at rest, plaintext client UX ✓ (but NOT true E2E)
- `messages.edited_at / is_edited / is_deleted / can_undo_until` columns ✓ (UI not wired everywhere)
- Voice + video calling (SlideToAnswer, stopCameraStream) ✓
- Discord-style emoji multi-select ✓
- Capacitor configured (`capacitor.config.ts`, `useNativeFeatures`) ✓
- OneSignal push integration ✓
- Federated sign-in (Google OAuth) + biometric gate ✓

## Build (in priority order)

### 1. True end-to-end encryption (DM only)
- Add `profiles.e2e_public_key` + new `e2e_device_keys` table (one row per device, X25519 public key).
- Use `libsignal-client` WASM or simpler `tweetnacl` (sealed box) per-recipient.
- Encrypt `messages.content` + media keys client-side; server only sees ciphertext. Group chats stay AES-at-rest for v1.
- Migration: keep old `content` column readable, add `ciphertext`, `nonce`, `algo` columns; new messages skip plaintext write.
- Settings toggle "Encrypted DMs (beta)" with key-backup recovery phrase modal.

### 2. Message edit + delete UI (data already exists)
- Long-press menu on own message → Edit / Delete for everyone / Delete for me.
- Edit window: 15 min (enforced via RPC checking `created_at`).
- Show "edited" label tied to `is_edited`; show "Message deleted" tombstone.
- Undo-send toast wired to `can_undo_until`.

### 3. Per-conversation notification settings
- New table `conversation_notification_prefs` (conversation_id, user_id, muted_until, sound, vibration_pattern, importance).
- Sheet on conversation header → Mute (1h / 8h / 1d / forever), custom sound picker, vibration pattern.
- Native side: map each conversation to its own Android NotificationChannel via Capacitor plugin (`@capacitor-community/notifications` or custom).

### 4. Native Android Conversation Bubbles
- Capacitor custom plugin (small Java/Kotlin file) that calls `NotificationCompat.Builder.setBubbleMetadata(...)` plus `setShortcutId` + `Person`.
- Requires long-lived `ShortcutInfo` per conversation — publish on first message.
- Falls back silently on iOS / web.

### 5. Direct Share Targets (Android share sheet)
- Same shortcut publishing pipeline as bubbles, marked `setCategories({SHARE_TARGET})`.
- Manifest entry `<meta-data android:name="android.app.shortcuts">` + `shortcuts.xml` so VYBE shows top-friend avatars in the OS share sheet.
- Capacitor `App.addListener('appUrlOpen')` already handles deep links; route `vybe://share?to=<id>` to DM composer prefilled with payload.

### 6. Emoji picker (system-level)
- Replace current grid with `<emoji-picker-element>` (works in WebView) + Android EmojiCompat font bundled via `@capacitor-community/emoji-compat` so older Android renders new emoji correctly.
- Reuse in: composer, reaction bar, status, comments.

### 7. Animate the software keyboard
- Use `@capacitor/keyboard` events (`keyboardWillShow/Hide`) → CSS variable `--kb-h`.
- Composer + message list translate up via Framer Motion spring (stiffness 300, damping 28) so input never jumps.
- iOS already smooth; this fixes Android jank.

### 8. Voice/video chat polish — Jetpack Telecom integration
- Capacitor plugin wrapping `androidx.core.telecom.CallsManager` so VYBE calls show in OS call log, route to Bluetooth/car, survive lockscreen.
- Foreground service with `FOREGROUND_SERVICE_TYPE_PHONE_CALL`.
- Existing WebRTC layer untouched; only signaling/UI gets Telecom hooks.

### 9. CredentialManager + Passkeys
- Add `@capgo/capacitor-credential-manager` (or thin wrapper).
- Sign-in screen offers "Sign in with passkey" before email/Google.
- Server: store passkey credential IDs in new `webauthn_credentials` table; verify via Supabase edge function using `@simplewebauthn/server`.

### 10. Add/edit rich content in share previews
- When user taps share on a post, open mini editor sheet: trim caption, add sticker overlay, swap thumbnail, then send to picked DM(s).
- Reuses existing CameraEditor sticker layer.

## Technical notes

```text
Build order (dependencies):
  shortcuts pipeline ──▶ bubbles (4)
                  └────▶ direct share targets (5)
  notif prefs table ──▶ per-convo channels (3) ──▶ bubbles (4)
  e2e key table  ────▶ encrypted DMs (1) ──▶ edit UI handles ciphertext (2)
  keyboard plugin ───▶ animation (7) + emoji picker layout (6)
```

Capacitor plugins to add:
- `@capacitor/keyboard` (animation)
- `@capacitor-community/emoji-compat` or bundled Noto Color Emoji
- Custom Kotlin plugin for: shortcuts/bubbles/share targets + Telecom CallsManager
- `@capgo/capacitor-credential-manager` for passkeys

DB migrations (one combined call):
- `e2e_device_keys`, columns on `messages` (`ciphertext`, `nonce`, `algo`)
- `conversation_notification_prefs`
- `webauthn_credentials`
- `conversation_shortcuts` (track which conversations have published an OS shortcut)

Out of scope for this round (call out, don't build):
- Multi-device sync UI (already implicit via Supabase session; no new device-list management)
- Group E2E (Signal Sender Keys) — punt to v2
- Custom LED colors (deprecated on modern Android)

After every native-touching change, remind user to `git pull` then `npx cap sync`.
