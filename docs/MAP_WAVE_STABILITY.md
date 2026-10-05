# Map Wave stability

This checkpoint repairs the existing friend-card Wave action. The previous client attempted a raw `notifications` write with type `map_wave`, which Rules reject. The checked replacement creates an in-app notification and reports success only after a validated server receipt. The original Mapbox 3D globe is unchanged. Waving does not enable GPS, create a location grant, send a chat message, or certify that the recipient has read the notification.

## Authority and retry contract

`manageMapWave` accepts only `action: 'send'`, `expectedOwnerUid`, `expectedProfileId`, `expectedAccountCreatedAt`, `targetProfileId`, `expectedAccessRevision`, and a UUID request ID. Names, coordinates, timestamps and notification text are not accepted from the caller. The sender name comes from the current canonical profile, with a bounded fallback.

The transaction checks both current Auth accounts and incarnations, exact UID/profile ownership, active protected account bindings, accepted friendship, both block directions, recipient location visibility and protected close-friend admission when needed. The recipient must currently share location **to the sender** through the captured grant revision, with sharing enabled and a current valid sample. The sender's own GPS can remain off. Ordinary samples expire within 120 seconds; `while_using` projections expire after 30 seconds. The recipient grant, global sharing state and sample must remain current. Legacy raw location rows are not adopted as permission.

The server rechecks both Auth identities after asynchronous transaction reads. Firestore conflicts retry the transaction and re-evaluate current consent. Auth is an external service: its last check cannot be atomic with the Firestore commit. This repair does not claim to eliminate that unavoidable boundary.

Notification creation, a protected receipt and a directional 60-second pair cooldown commit atomically. Cooldown identity includes both Auth incarnations. Exact body/actor/incarnation fingerprints bind retries. Concurrent identical requests create one notification; a different request during the cooldown fails explicitly. A successful retry returns the original notification and original send time, never a new send. Replay still requires current consent and exact source versions. Pause/resume, disable/re-enable, binding changes, or deleted/recreated grant, sharing state or notification documents invalidate old receipts. A deleted notification is not recreated by retry.

The receipt contains `ok`, `action`, `ownerUid`, `profileId`, `accountCreatedAt`, `targetProfileId`, `requestId`, `accessRevision`, `status: 'sent'`, `notificationId`, `sentAt`, `cooldownUntil`, `serverTime`, `validUntil`, and `replayed`. `sent` means the in-app notification exists. The response lease is at most 15 seconds and no longer than current sample/grant admission. Cooldown rejection includes checked `serverTime` and `cooldownUntil`; a generic callable rate-limit error does not imply a send was rejected before commit. The callable separately limits requests to 30 per minute per UID.

## Client behavior

The friend-card action uses the currently admitted friend, account, captured grant and visible selection. It has duplicate-tap protection, a 15-second deadline and explicit errors. Delayed work cannot acknowledge another account, closed card, hidden view or changed permission. Names and coordinates do not enter the request or retry storage. Retry storage retains only a complete-body hash and UUID, bounded to 32 attempts. An uncertain attempt survives a lost reply or interrupted view; only a checked acknowledgment or a specifically verified terminal rejection retires it. The UI distinguishes an earlier confirmed wave from a newly created notification and shows the remaining cooldown.

## Device push remains unavailable for Waves

`onSocialNotificationCreated` returns immediately for `map_wave`, before device lookup, notification-preference lookup or provider dispatch. The in-app bell record remains available. Other notification types keep their existing behavior. There are no new Wave provider helpers or dormant delivery claims.

This is a deliberate delivery limitation pending a complete device-registration authority repair. The existing `push_tokens` update rule can permit owner reassignment, and `functions/src/push.ts` resolves a supplied profile ID in `resolveProfileIdForAuth` before `linkOnesignalUser` writes device/provider associations. FCM/Web token readers and OneSignal external-ID/fallback paths therefore cannot currently prove that every selected target belongs to the intended recipient. An admission check for the Wave itself cannot repair that device provenance gap.

A follow-up must bind registration and unlinking to the current canonical UID, Auth incarnation and verified provider/device ownership; reject arbitrary supplied recipient IDs; make ownership immutable; and route delivery only through protected current registration evidence. Historical mutable token rows, unsigned native external IDs and existing provider aliases must not be automatically treated as proven. This checkpoint does not tighten or certify generic push delivery and does not claim successful device delivery.

## Coordinated rollout

No production deployment is implied by these source changes. The checked account-profile and location-sharing releases are prerequisites. Review and deploy only the exact named Functions `manageMapWave` and `onSocialNotificationCreated`, alongside matching Firestore rules/index configuration and the tested client. Do not use a broad Functions deploy; `auth2faRequest` remains excluded. No new secret, Auth configuration, Storage rule or provider configuration is required.

- Deny all direct client reads and writes to `_map_wave_receipts` and `_map_wave_cooldowns`, including raw staff access.
- Keep raw client `map_wave` notification creation denied. The existing recipient bell-read behavior remains.
- Provision the checked-in `expireAt` TTL field override on `_map_wave_cooldowns`. Cleanup is eligible after 24 hours; the actual cooldown expires after 60 seconds regardless of cleanup timing.
- Keep `_map_wave_receipts` durable with no TTL. No new composite index is required; existing friend/block lookup indexes are reused.
- Publish the tested client through Lovable Share → Publish after coordinated server/rules readiness. GitHub changes alone do not publish the website or native web bundle. Never deploy demo preview wrappers or fixtures.

Old raw-write clients continue to fail rather than bypassing checks. Real GPS, native/background behavior and future device delivery require their own verification. No external provider call or production data mutation is part of this checkpoint.

## Verification

The isolated `demo-vybe-map-waves` suite uses real Auth and Firestore emulators, synthetic profiles, explicit checked location requests/acceptance and synthetic coordinates. It exercises strict request binding, concurrent receipts and cooldowns, live privacy/blocks/friendship, pause/global-sharing changes, sample expiry, current and delayed Auth changes, source deletion/recreation, and raw Rules denial. Trigger tests prove Wave events stop before recipient/device/preferences/provider lookup; existing non-Wave push regressions preserve generic behavior. Final totals and manual preview evidence are recorded by the integration checkpoint in `WORKLOG.md`.
