# Call-history read recovery — 2026-11-14

The existing caller/receiver history queries exhausted Firestore's 1,000-expression budget and appeared as permission failures in Messages. The exact live-baseline repair resolves the existing identity once before the legacy ownership fallback. UID, owned profile aliases and group participants retain their existing admission; the direct-profile ambiguity guard and retired-binding rejection remain.

The eleven real emulator SDK checks include caller/receiver queries for both canonical profile and UID, exact receiver reads, legacy owned aliases, group participant reads/queries, outsider/guest denial, ambiguous-alias denial and retired-binding denial. The unmodified prior live baseline failed the caller query with the expression-limit error. The twelve conversation-member checks also pass with this combined candidate.

Only `security/call-history-read-20261114.rules` was activated. The prior DM optimization and every unrelated live rule are preserved. Cloud compilation reported zero errors. Authenticated activation and source readback verified ruleset `dbfd3859-7910-4f74-adf3-5ffe78800fd9`, SHA256 `705f82b84f2795bc29d883cce4b0b84f73621f25cf3719780671cd165ff6957f`, at 2026-11-15T00:28:53.719Z. See `deployment.json`.

A fresh signed-in production Messages reload displayed the inbox with no new warnings/errors captured after reload, including no member-list or call-summary permission warning. This verifies a read path; no real call or microphone/camera permission was initiated.

No Cloud Functions, indexes, Storage rules, Auth settings, IAM, credentials, billing, real-user records or native binary were changed. Do not deploy the root rules wholesale or blindly restore the saved prior baseline over a later release.
