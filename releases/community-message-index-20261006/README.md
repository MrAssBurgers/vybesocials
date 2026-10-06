# Existing community message query index

The current channel history read and realtime listener both filter `channel_id` and `is_deleted == false`, then order `created_at` ascending. Production had no matching composite index. All four exact queries for the designated owned community failed with `FAILED_PRECONDITION` and an index-required error, although the current owner policy admitted all four channels and one existing message was preserved.

Provision only the one index in this manifest: `channel_messages`, collection scope, `channel_id ASC`, `is_deleted ASC`, `created_at ASC`. The implicit document-name ordering is ascending. Preserve all other production indexes, Rules, services, accounts and records. Do not deploy the entire root index manifest or delete unrelated resources.

The read audit checks the designated current Firebase Auth creation time against its protected active profile binding before exercising read-only community policy and exact message queries. It is an administrative domain/query check, not an impersonated client or proof of rendered phone behavior. The signed-in browser still receives an old client; owner recovery and actual current-client rendering remain separate checks.

The exact index is now READY. All four previously failing queries succeed, and the one preserved message is returned. See `verification.json` for the resource, provisioning operation, aggregate before/after evidence and passing test/build results. No web runtime changed; no Lovable republish is needed for this index-only repair.
