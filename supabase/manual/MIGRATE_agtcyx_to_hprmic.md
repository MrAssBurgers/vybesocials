# Migrate live data: agtcyx → hprmic (Option B)

Move user data from Lovable production Supabase **`agtcyxjxgkdyoxwxkjth`** into your owned project **`hprmicwhlaaqfgshucec`**.

## Who can run this

| Actor | Can run migration? |
|-------|-------------------|
| **You (locally)** | Yes — paste both service role keys into `.env` and run npm commands |
| **Cursor / Lovable agent** | **No** — Lovable blocks `SUPABASE_SERVICE_ROLE_KEY` from agents; agtcyx is not attached to this Cloud workspace |
| **Lovable support** | Can provide agtcyx **service_role key** or a **database dump** |

This is expected. The script is ready; **you run it on your machine**.

---

## Keys you need

Add to local `.env` (gitignored — never commit):

```bash
AGTCYX_URL=https://agtcyxjxgkdyoxwxkjth.supabase.co
AGTCYX_SERVICE_ROLE_KEY=<from Lovable support — not in Cloud UI>

HPRMIC_URL=https://hprmicwhlaaqfgshucec.supabase.co
HPRMIC_SERVICE_ROLE_KEY=<Supabase dashboard → hprmic → Settings → API → service_role>
```

### Email template for Lovable support

> Project: `416714c8-d013-4aff-984d-522418a9bbc7` (vybehub.app)  
> Please provide either:  
> 1. The **service_role** key for Supabase project **`agtcyxjxgkdyoxwxkjth`**, or  
> 2. A **pg_dump** / SQL export of `auth.users` + `public` schema (and storage bucket list) so I can migrate into my owned project **`hprmicwhlaaqfgshucec`**.

---

## Commands (run on your Mac, in this repo)

```bash
npm run migrate:agtcyx -- --verify
npm run migrate:agtcyx -- --dry-run
npm run migrate:agtcyx -- --execute
npm run migrate:agtcyx -- --storage-only --execute   # avatars / post media
```

Flags:

- **`--skip-auth`** — public tables only (use if you imported `auth.users` via SQL dump first)

---

## What the script does

1. **auth.users** — Admin API, **same UUIDs** as agtcyx (required for profiles/posts FKs)
2. **~34 public tables** — profiles, posts, DMs, friends, notifications, etc. (FK-safe order)
3. **Storage buckets** — avatars, posts, stories, messages, etc. (second pass)

**Skipped on hprmic:** seed/config tables (badges, challenges templates, stripe_config, …).

---

## Passwords after migrate

The Auth Admin API **does not copy password hashes**. After migrate:

- Everyone uses **Forgot password** once on vybehub.app, **or**
- If Lovable gives a SQL dump, run `MIGRATE_auth_import.sql` on hprmic to copy `encrypted_password` from the dump.

---

## Post-migration

- [ ] Forgot password → log in as Bakrix
- [ ] Home feed has posts; profile shows Bakrix
- [ ] Avatars load (storage pass completed)
- [ ] `PENDING_20260530.sql` on hprmic if RPCs missing
- [ ] Lovable Backend deploy edge functions on **hprmic**
- [ ] Lovable → Share → Publish

---

## If Lovable only gives a SQL dump (no agtcyx key)

1. Restore dump to a temp database or extract `auth.users` + `public.*` INSERTs
2. Run auth import SQL on **hprmic** (see `MIGRATE_auth_import.sql` notes)
3. `npm run migrate:agtcyx -- --skip-auth --execute` for any tables not in the dump
4. Storage: manual bucket copy in Supabase dashboard or ask Lovable for storage export
