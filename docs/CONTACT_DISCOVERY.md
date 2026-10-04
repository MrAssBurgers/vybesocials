# Verified contact discovery

The existing Search → Find friends and Settings contact screens use the same device picker, local hashing, account-bound service and matching endpoint. These changes require the reviewed `matchContacts` callable and Firestore deny rules to be deployed together. There is no production deployment or real-contact collection in the implementation tests.

## Phone ownership and explicit discovery

The server reads the current Firebase Auth user record. Only a non-disabled account with a valid `phoneNumber` can opt into being found. It derives the hash itself and stores the explicit choice in `_contact_discovery/{uid}` with a reverse hash entry in `_contact_discovery_phones/{sha256}`. Both namespaces and `_contact_discovery_limits` are inaccessible to browser clients, including browser admin claims. Canonical profile identities must pass the shared UID/legacy-profile collision checks.

Every match rechecks the candidate's current Firebase Auth phone, protected opt-in and index binding, profile identity and both directions of blocks. A changed phone, deleted/disabled Auth account, deleted/ambiguous profile, opt-out, or current block suppresses the match. A recycled number's former owner cannot delete the new owner's index by opting out. These are checks during a request, not a claim that already delivered profile names can be remotely erased.

Legacy `profiles.phone_verified`, `phone_number`, `phone_e164_sha256` and `contact_discoverable` fields are never ownership or opt-in authority. Settings now reads `phoneVerificationState` from Firebase Auth and deliberately re-verifies legacy numbers through `phoneVerifyRequest` / `phoneVerifyConfirm`. After a fresh Twilio Verify approval, the server links the number to that same Firebase Auth account. Auth enforces number uniqueness. Discovery remains a separate explicit opt-in. No Auth provider settings or secrets change.

Phone linking requires sign-in within ten minutes, strict account/profile bindings, six-digit codes, expiring server-only challenges, send/check quotas and a protected worker lease. Send retries reuse their request ID; concurrent or superseded checks cannot start another link. A lost Auth response can be reconciled from protected approval without reusing the provider OTP. Completed receipts never restore a later changed Auth phone. These safeguards coordinate Firestore and Auth; they do not make external Auth writes transactional. Callable timeout is 60 seconds and the worker lease is two minutes. A failed uncertain write may require waiting before retrying Verify.

Only a successful verification removes the current canonical owner's three obsolete public phone fields. No alias profile is created and there is no bulk migration or automatic attestation of legacy records. Historical fields on accounts that have not re-verified still need deliberate cleanup. SMS login fallback now reads current Firebase Auth ownership and cannot use writable public profile flags; login confirmation requires an actual pending SMS login challenge and rechecks it transactionally before returning a token.

`_phone_verifications/{uid}` and `_phone_verification_limits/{uid}` remain browser-inaccessible. One current verification record per account bounds storage; it contains the phone needed for SMS/recovery. Quota records contain only counters/times. Phone/OTP values must never be logged. Named rollout prerequisites are the three phone callables, reviewed `auth2faVerifyPhone` and `authLoginApproval`, the existing `matchContacts`, and reviewed rules. **Leave `auth2faRequest` undeployed** until its independent pending auth stubs are repaired. Twilio delivery has only been simulated in these tests; real-provider and native-device verification remains required.


## Contact handling

The Despia native picker is preferred, with Web Contact Picker fallback where supported. Cancellation returns to the idle state. Permission, platform and service failures remain visible and retryable; a failed request is never presented as an empty contact result. Search cancellation discards a delayed picker response; it cannot forcibly dismiss the native operating-system picker.

Contact names and original numbers remain in local component memory. US/Canada local numbers and explicit `+` international numbers are accepted; ambiguous numbers and extensions are skipped. All selected numbers are considered, duplicates are removed, and no unsupported country prefix is invented. The client hashes locally and sends at most 200 hashes per call, up to 2,000 selected numbers. The server enforces 2,000 matched input hashes and 50 match requests per account per UTC day, plus a shared 30-request/minute burst limit. Quota records contain counts, never the submitted contact list. Hashes are deterministic low-entropy identifiers, **not encryption**; matching and quotas reduce exposure but do not eliminate enumeration risk.

New searches do not upload address-book records into `contact_hashes`, persist names/numbers in a query cache, or automatically create referral links. Existing uploaded hashes are not used for matching and remain until the owner deliberately uses the retained clear control. Invitations open a chosen contact's SMS composer with a generic VYBE link and never claim the message was sent. An unmatched contact may already use VYBE with discovery disabled.

Client work captures authenticated UID, profile and observed account epoch, including away-and-back transitions. Picker, hashing, network, preference and friendship callbacks are guarded. Account changes/unmount hide results and stop later requests. Requests already accepted by the backend may complete for the original UID, but may not run under another token because the backend requires the expected UID.

## Callable contract

`matchContacts` takes `{action, expectedOwnerUid, expectedProfileId}` plus action fields:

- `state`: returns `{success, ownerUid, profileId, eligible, discoverable, maskedPhone, legacyPhoneNeedsVerification}`.
- `setDiscoverable`: requires boolean `discoverable`; returns the same checked state. It never enrolls automatically.
- `match`: requires `hashes`, at most 200 lowercase SHA-256 strings; returns `{success, ownerUid, profileId, matches}`. Each match has `id`, `username`, `display_name`, `avatar_url`, `is_verified`, and the requested `phone_hash`. No plaintext phone is returned.

Old `discover_users_by_phone` callers were removed from the reachable flow. The legacy compatibility `match_contacts` RPC signature does not carry the new actor/action fields and is intentionally not used. The fresh service invokes the callable directly. No additional composite index or callable export is required.

## Verification

Client tests cover normalization, bounded hashed payloads, malformed receipts, cancellation, retry, preference failures, friend request failures, and account changes during picker/network work. The real demo-only Auth/Firestore fixture verifies current phone ownership, recycled phones, disabled/deleted accounts, legacy forgery rejection, identity collisions, blocks, opt-out races and atomic quotas. Separate rules tests deny reads, listings, creation, updates and deletion for owners, strangers, guests and client admin claims across all three protected namespaces. No provider SMS or real address book is used.
