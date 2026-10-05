# Original sound publishing

The existing Sounds page (`/sounds`) now publishes selected audio bytes after an explicit **Publish sound** action. Choosing a file does not publish it. The form states that recordings are public and the uploader must have the right to share them. Technical checks do not establish copyright or content approval; new records carry `moderation_status: not_reviewed`. No XP is awarded.

## Authority and transport

`uploadSound` accepts `reserve`, `status`, `finalize`, and `cancel`, always binding Firebase UID and the expected canonical profile. Reserve requires a stable request ID, title, tags, exact size/type/SHA-256 and public consent. The protected `_sound_uploads` receipt binds an immutable `sound-uploads/{uid}/{uploadId}/source` object. Only that owner may create exactly the reserved object before its 15-minute expiry. Clients cannot read, overwrite or delete it through Storage rules, or mutate proof/publication records. A daily protected limit allows 20 reservations and 200 MiB; request throttles also apply.

The browser uses Firebase resumable upload for the actual selected `File`, then requests finalization. The server downloads the exact generation after checking size/type, checks the hash, and decodes real samples using the bundled FFmpeg executable. No shell is used. Accepted input is MP3, WAV, OGG, AAC or M4A, 16 bytes through 20 MiB and 0.1–60 decoded seconds. Format signatures, explicit demuxers, local file/pipe protocols, disabled MOV external references, a 25-second process timeout, bounded diagnostics/output and single-call concurrency limit processing. Audio-only input is normalized to stereo 44.1 kHz PCM WAV; input is not copied blindly into the public library.

The server writes a unique normalized candidate with an immutable generation, then atomically selects it and creates `sounds/{uploadId}` with the protected receipt. Concurrent finalizers share a 150-second lease. Replay validates the surviving canonical publication; removal or moderation denial never silently recreates it. Cancellation wins before the publication transaction or acknowledges an already committed publication. A lost response retains the same request identity across remount/reload within the same browser tab. Confirmed expired/cancelled unpublished attempts can be deliberately retried with the retained file; an unknown or removed published attempt retains its identity.

## Library and playback

`readSoundLibrary` returns only current proof-backed publications, rechecks strict owner/viewer identity and bilateral blocks, and excludes removed or moderated records. Legacy browser-created `sounds` rows are not adopted automatically. List cursors are random opaque references bound to viewer/profile/list scope with ten-minute expiry. `_sound_library_cursors.expireAt` requires Firestore TTL cleanup. The client shows at most 100 recent sounds per list, with explicit read errors; popularity counters are not fabricated. My uploads exposes the resulting publication. The existing search filters these loaded rows.

Sound data uses UID/profile/account-epoch cache keys, is excluded from disk serialization/restoration, and is masked after failed current reads. List/detail reads refresh every 15 seconds and on focus. Every explicit Play rechecks its exact sound before constructing Audio. A failed or stalled admission does not play cached media; account changes, hidden pages and retired views stop playback. The UI retains the selected file/title after failed publication and does not announce success until receiving the durable receipt.

## Operational limits and rollout

Deploy the matching named `uploadSound` / `readSoundLibrary` exports, reviewed Firestore/Storage rules, `_sound_uploads` list indexes and cursor TTL together with the client. FFmpeg must exist and run in the Functions Linux build. The isolated fixture uses a generated synthetic tone, real decoding and Firebase emulators; no licensed recordings or external providers are used.

Published originals are deliberately public. Firebase download URLs are bearer URLs: copied bytes or links cannot be revoked merely by hiding a library entry, blocking an account, or denying a new checked read. Storage raw reads require current publication proof, but a previously issued token bypasses rule evaluation. An operator removing audio must also revoke object download tokens/delete the exact selected generation as appropriate. Source-upload responses may contain Firebase download metadata too; the upload has already required explicit public sharing intent. This is not a confidential-media transport.

Source and known losing candidates are deleted on confirmed completion/cancellation/failure where safe. Unknown transaction commit outcomes retain a candidate to avoid deleting a successful publication. Abandoned/expired reservations and retained orphan objects still need a bounded operator cleanup/lifecycle policy before high-volume operation; Firestore and Storage are not one transaction. A malicious or malformed file is not evidence of content/copyright review.

Saved-sound collections, play/usage analytics, provider catalogs and video audio mixing remain separate existing gaps. Uploading/playing an original does not claim that a video export includes it. There is no client moderation/deletion UI in this repair; existing authorized operator action must handle publication removal and object cleanup. No production deployment is performed by this change.

## Verification

`scripts/test-sound-upload-backend.mjs` requires isolated `demo-*` Firestore + Storage emulator endpoints and exercises real synthetic decoding, immutable upload rules, strict identities, replay/removal, cancellation/finalize races, quotas, protected reads, blocks and opaque pagination. Targeted client tests cover actual File transport, lost upload/finalize acknowledgements, account retirement, consent, retained failure drafts, admission before playback and private cache exclusion.

Final isolated run: 12 backend groups and 76 rule checks passed (`work/sound-upload-qa/sound-qa-final.log`). Focused client validation: 79 tests across seven files, app typecheck, Functions build and scoped lint passed. Retained preview/browser validation is recorded by the root checkpoint handoff.
