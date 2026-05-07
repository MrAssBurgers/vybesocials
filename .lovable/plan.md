New hypothesis: the repeated publishing failures are not caused by `package.json`, missing VITE env vars, or the SEO pages; they are caused by the recent email/queue diagnostic migrations being present in the repo but not successfully applied during publish, so the publish pipeline keeps stopping before the latest backend state is deployed.

Evidence I found in read-only investigation:
- `package.json` has only `vite build` for production; there are no `postbuild`, `prebuild`, `prepare`, or env-dependent post-build scripts.
- `vite.config.ts` already hardcodes fallbacks for the public backend URL, project id, and anon/publishable key.
- The preview server logs show no frontend syntax/dependency error; only a Tailwind ambiguous class warning.
- The published site is already public, so this is not a private-visibility issue.
- The latest local migrations from `20260507143505` through `20260507144419` include repeated `pgmq`/email queue helpers and diagnostics, but neither the test nor live backend shows any `20260507` migration versions applied.
- The diagnostic function created by those migrations does not exist in test or live, confirming the migration chain did not land.

Plan to fix after approval:

1. Replace the fragile migration chain
   - Remove/consolidate the seven recent `20260507` email queue publish-fix migrations that have not applied.
   - Replace them with one safe, idempotent migration.
   - Avoid direct static references to optional `pgmq` functions unless the schema exists.
   - Use dynamic SQL where needed so missing optional queue infrastructure cannot break publish.
   - Guard role grants so they only run when the target role exists.

2. Keep the frontend SEO work intact
   - Leave `/local`, `/local/:city`, JSON-LD, OG image tags, footer internal links, and sitemap entries in place unless the actual build log proves they are the failure source.
   - Do not edit the auto-generated backend client/types files manually.

3. Re-check backend deployment state
   - Query the migration history after the fix to confirm the new migration version appears in the backend.
   - Verify the email queue diagnostic/helper functions exist and return safe empty results if optional queue support is unavailable.

4. Re-check frontend publish blockers
   - Inspect the latest build/deploy output available from the project logs.
   - Search for Rollup/Vite dependency errors, missing imports, bad route imports, and HTML transform errors.
   - If a frontend error appears, fix that specific syntax/dependency issue directly instead of guessing.

5. Final verification
   - Confirm `/local` still renders in preview.
   - Confirm the production publish configuration remains public.
   - Confirm the repository no longer contains a publish-blocking unapplied migration chain.

After you approve this plan, I’ll make the migration/code changes directly and verify with the available project/backend diagnostics.

<lov-actions>
<lov-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</lov-link>
</lov-actions>