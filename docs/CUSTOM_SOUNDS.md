# Personal custom tones

Custom message tones and call ringtones use Firebase Auth, Firestore and Storage. Deploy the matching rules with this client before enabling uploaded tones. This checkpoint changes source and isolated demo rules only; it does not deploy production.

## Ownership and compatibility

- New `user_custom_sounds` documents use `{user_id}_{sound_type}`. `user_id` can be the Auth UID or an existing profile whose `user_id` matches it. The browser cannot preallocate another account's canonical tone ID.
- Reads and deletes require the stored owner or the existing admin permission. Updates also require the existing owner/admin, retain both `user_id` and `sound_type`, and cannot introduce arbitrary fields. A requested future owner never grants update access.
- The compatibility upsert first queries the authenticated owner's `user_id` plus `sound_type`. A single migrated row with an arbitrary document ID can still be updated in place. Retained legacy fields cannot be changed by the browser. This is not a cleanup or certification of previously forged historical rows.
- Metadata URLs are limited to 4,096 characters, filenames to 255, and message-tone duration to five seconds. Client-reported timestamps and durations are metadata, not server attestations. Firestore does not inspect audio bytes or verify the claimed duration.

## Uploaded bytes

The client writes `custom-sounds/{authUid}/{message_tone|call_ringtone}.{mp3|wav|m4a}`. A profile ID is not a Storage ownership prefix. Authenticated Storage SDK reads, updates and deletes are limited to the exact Auth UID; other users and an admin claim alone do not gain access.

Storage enforces nonempty files of at most five MiB and an audio MIME matching the filename extension. The client decodes metadata before uploading and supplies a canonical MIME, including when the browser initially reports no MIME. These checks are not audio-content moderation, malware analysis, proof of file contents, or a server-verified duration check.

Firebase download URLs contain bearer tokens. Someone who obtains such a URL may fetch it without the owning account. Owner-only metadata reads reduce unintended disclosure but do not make copied URLs revocable session credentials. Do not log or publicly expose uploaded-tone URLs. Replacement and deletion retain the existing object paths; this is not an atomic Storage/Firestore transaction and historical orphan files are not automatically discovered.

## Verification

`scripts/test-custom-sound-rules.mjs` refuses non-demo projects and remote emulator endpoints. It tests actual Firestore/Storage rules: UID/profile access, canonical creation, migrated-row upsert, owner/type immutability, takeover and enumeration denials, metadata bounds, private bytes, supported MIME paths, empty/oversized uploads and owner deletion.

The isolated local run passed 77 sound checks plus 173 creator-platform, 22 game-capture-post and 112 customization regressions. Browser playback quality and native silent-mode/haptic behavior require device testing; rule tests do not establish those properties.
