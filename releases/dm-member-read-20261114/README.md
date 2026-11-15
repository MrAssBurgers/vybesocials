# Conversation-member read recovery — 2026-11-14

The production member-list query exhausted Firestore's 1,000-expression budget. The repair resolves the existing conversation identity once and tries the existing parent-membership admission before the expensive ownership fallbacks.

Only the exact deployed baseline was patched. `security/dm-member-read-20261114.rules` preserves the rest of ruleset `a1e2c40a-f544-4155-8f7b-f6c7e5317923` (SHA256 `f7be92e5abb8fa5fb8c8a9fc263440a3478a0e9829b92c84d0085402df999f78`). The root rules contain unrelated pending work and were not deployed.

The candidate passed cloud compilation and twelve real emulator SDK checks: both participants, exact reads, equality/IN queries, batches of 2/5/10 conversations, and rejection of outsiders, guests and a retired binding. The baseline failed the same member query with the expression-limit error.

Activation returned HTTP 503, but authenticated release/source readback confirmed it applied. No duplicate activation was submitted. See `deployment.json` for ruleset `ac6a59b5-c4d3-4109-98f3-ad540f0da5f3` and exact hash. A fresh signed-in production Messages load stopped emitting the member-list permission warning.

The later call-history repair preserves this change and is now the active ruleset; see [call-history release](../call-history-read-20261114/README.md). The saved baseline is rollback evidence, not an instruction to overwrite a newer active release.
