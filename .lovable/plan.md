New hypothesis: the previous fix deleted only the later email/queue migrations, but two earlier May 7 email helper migrations and several unapplied May 7 schema migrations still remain in the repo; Live is still behind at May 6, so publish keeps trying to replay a fragile migration chain that references optional `pgmq` helpers and objects not safely applied to Live.

Evidence found in read-only investigation:
- Production migration history still stops at `20260506151609`; none of the local `20260507...` migration files are recorded on Live.
- Test has May 7 migration versions recorded, including deleted versions (`20260507143502` through `20260507144418`), which proves Test and repo migration history are diverged.
- The repo still contains `20260507140737...` and `20260507141517...`, both defining email queue helpers with static `pgmq.*` references.
- Production still has the old unsafe email helpers: `read_email_batch` still calls `pgmq.create(queue_name)` from a read path, and helper functions do not have hardened `search_path` settings.
- The currently published site is already public, and `package.json` only runs `vite build`, so this is not a visibility or post-build env-var issue.
- Recent database logs do not show active frontend/runtime errors, which points back to publish-time migration drift.

Plan after approval:

1. Remove the remaining publish-blocking migration drift
   - Delete the two remaining May 7 email queue helper migrations:
     - `supabase/migrations/20260507140737_21d94856-1b09-44f4-a75c-fa36b569bc52.sql`
     - `supabase/migrations/20260507141517_e9ee9c25-78d7-4d11-83cc-cf4040d81645.sql`
   - Review the other local `20260507...` migration files and either keep only the ones that are safe/idempotent for Live or consolidate them so Live does not have to replay duplicate/fragile partial fixes.

2. Restore email infrastructure using the supported platform tool
   - Run the Lovable Cloud email infrastructure setup tool instead of hand-written queue migrations.
   - This should create/repair the queue tables, RPC wrappers, send logs, suppression/unsubscribe support, worker function, and cron wiring through the supported path.
   - Keep the existing Edge Function source files unless the setup/verification shows a concrete mismatch.

3. Add one safe follow-up migration only if needed
   - If the supported setup leaves the old unsafe helper body on Live, add a single idempotent migration that only hardens public RPC wrappers.
   - It will use `SECURITY DEFINER` with `SET search_path = public` and dynamic `EXECUTE` for optional `pgmq` calls so function creation does not fail if optional queue infrastructure is absent.
   - It will guard `GRANT`/`REVOKE` statements so missing roles cannot break publish.
   - It will ensure read helpers return an empty result in read-only transactions instead of trying to create queues.

4. Keep SEO/frontend changes intact
   - Leave `/local`, `/local/:city`, JSON-LD, OG image tags, footer internal links, and sitemap entries in place.
   - Do not edit generated backend client/types files.
   - Only touch frontend code if the latest publish/build diagnostics expose a specific Vite/Rollup syntax or dependency error.

5. Verify the fix
   - Query Test and Live migration history again to confirm the repo no longer contains a publish-blocking unapplied email migration chain.
   - Verify Live email helper functions are safe: no lazy queue creation from `read_email_batch`, hardened search paths, and backend-only execute grants where appropriate.
   - Re-check publish visibility remains public.
   - Confirm `/local` still renders in preview and that the SEO files/routes remain wired.

This will focus the fix on the actual remaining publish blocker: backend migration drift and unsupported email queue setup, without rolling back the SEO work.