# Firebase loading and Reports repair — 2026-10-06

The existing client called missing Reports services; challenge progress failed because the conversations activity query lacked its composite index. Deployed only `reportModeration`, with verified staff authority, bounded deletion history, and server aggregate moderation count. Private Reports namespaces are closed to direct browsers, including browsers carrying an admin claim.

Firestore baseline SHA-256: `0c53b71daf9effeeb9de06ce85cb2bf34cdf2709707ef7658e569628ceec3435`.
Report slice SHA-256: `18f965b2847b6aed6a7bf783dd23e3cac666b0cf3c3fdf231717e2218c720f9a`.
Ruleset: `d0745aa2-22ce-43e1-a88d-e867e0c3697e` (subsequently extended only by the adjacent community slice).

`resources.json` contains 42 additive index requirements for retained content and activity reads. All 42 are READY; existing indexes and TTL policies were preserved. Every challenge source query was independently executed against live Firebase with the designated account aliases; no activity, reward or challenge counter was fabricated.

Verification: 242 isolated report Rules checks; 23 real Firestore backend groups; 69 focused client tests; full app suite 460 files / 4,373 tests passed, six tests skipped. Build, typecheck and lint passed (five existing lint warnings); initial bundle remains within the enforced budget. The initial full Rules test correctly failed at unrelated, unreleased creator-platform rules; `--report-slice-only` explicitly scopes that check without changing its full default coverage.

Auth surfaces now emit decorative waves on focus, input and pointer interactions and while requests are pending. They prewarm the existing login chunk, cap reactions, preserve inputs and account guards, disable motion under the existing reduced-motion preference and never delay authentication for animation. Desktop and 390px signup forms were manually checked without creating an account or accepting terms.

Remaining restoration is not certified by this release: private legacy membership must retain its ownership/admission checks; old public media currently references the retained legacy host and needs a guarded Firebase asset migration. Provider delivery, real phone cold launch and video/audio calls require separate verification. No secret, Auth setting, Storage rule, historical content visibility or external message was changed.
