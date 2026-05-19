## Findings

- Lovable Cloud is currently healthy for both Test and Live.
- The previous connection-slot failure is not present in the last few hours.
- The audit/database logs now show a recurring error every 5 seconds:
  - `relation "pgmq.q_auth_emails" does not exist`
- The source is cron job `process-email-queue`, which runs every 5 seconds and checks `pgmq.q_auth_emails` / `pgmq.q_transactional_emails` before calling the email queue processor.
- The `pgmq` extension exists, but only `pgmq.meta` exists; the actual queue tables are missing.
- This creates constant database errors and connection churn, which can destabilize publishing even when the backend looks healthy.

## Plan

1. Repair the email queue infrastructure with a database migration:
   - Ensure `pgmq` exists.
   - Recreate the missing queues:
     - `auth_emails`
     - `transactional_emails`
     - `auth_emails_dlq`
     - `transactional_emails_dlq`
   - Make the migration idempotent so it is safe if queues already exist.

2. Harden the cron job so it cannot spam errors again:
   - Update `process-email-queue` cron to use safe helper functions instead of directly referencing `pgmq.q_*` tables.
   - If a queue is missing in the future, the helper should recreate it or return safely.
   - Keep the 5-second schedule only if the queue checks are safe.

3. Verify after the migration:
   - Confirm the queue tables exist.
   - Confirm the cron job is active and no longer producing `pgmq.q_auth_emails` errors.
   - Re-check recent auth/database logs for publishing-related failures.

## Expected result

Publishing should stop failing from backend audit-log noise or connection churn caused by the broken email queue cron job.