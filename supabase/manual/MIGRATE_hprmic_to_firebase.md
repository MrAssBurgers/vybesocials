# Migrate hprmic (Supabase) → vybe-daaab (Firebase)

One-time data move: **Supabase `hprmicwhlaaqfgshucec`** → **Firebase `vybe-daaab`**.

**Never commit:** `service_role` keys, DB passwords, `secrets/firebase-admin.json`, or `./export/`.

---

## Step 1 — Credentials (do not paste into chat)

| Source | Where |
|--------|--------|
| **Supabase service_role** | [hprmic](https://supabase.com/dashboard/project/hprmicwhlaaqfgshucec) → Project Settings → API → `service_role` |
| **Supabase DB URL** | Project Settings → Database → Connection string (URI, **pooling OFF**, role `postgres`) |
| **Firebase Admin JSON** | [vybe-daaab](https://console.firebase.google.com/project/vybe-daaab/settings/serviceaccounts/adminsdk) → Generate new private key → save as `./secrets/firebase-admin.json` |

---

## Step 2 — Clone & install

```bash
git clone <your-repo> && cd <repo>
npm install
```

---

## Step 3 — Export from Supabase (hprmic)

```bash
export SUPABASE_URL=https://hprmicwhlaaqfgshucec.supabase.co
export SUPABASE_SERVICE_ROLE_KEY='<service_role>'
npm run migrate:firebase:export
```

Output: `./export/tables/*.ndjson`, `./export/auth-users.ndjson`, `./export/storage/`, `./export/MANIFEST.json`

---

## Step 4 — Export password hashes (requires DB URL)

```bash
export SUPABASE_DB_URL='postgres://postgres:<db-password>@db.hprmicwhlaaqfgshucec.supabase.co:5432/postgres'
npm run migrate:firebase:auth-hashes
```

Output: `./export/firebase-users.json`

---

## Step 5 — Import into Firebase

```bash
export GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin.json
```

### 5a — Auth users (preserves UID + bcrypt password)

```bash
firebase auth:import ./export/firebase-users.json \
  --hash-algo=BCRYPT \
  --project=vybe-daaab
```

OAuth-only users (Google/Apple, no password hash) are **not** in this file — they re-link on first OAuth sign-in after publish.

### 5b — Firestore + Storage

```bash
npm run migrate:firebase:import
```

Dry run first (optional):

```bash
npm run migrate:firebase:import -- --dry
```

---

## Step 6 — Verify

```bash
export SUPABASE_URL=https://hprmicwhlaaqfgshucec.supabase.co
export SUPABASE_SERVICE_ROLE_KEY='<service_role>'
export GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin.json
npm run migrate:firebase:verify
```

Writes `./export/VERIFY.json`. Exit code `0` = all row counts match.

---

## After verify ✅

1. Lovable env → all `VITE_FIREBASE_*` (see `.env.example`)
2. `VITE_MAINTENANCE_MODE=false` when ready
3. Lovable → **Publish** → vybehub.app
4. Users with migrated passwords sign in unchanged; OAuth users use Google/Apple once

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `SUPABASE_SERVICE_ROLE_KEY missing` | Export env vars in same shell |
| `psql: command not found` | Install PostgreSQL client (`brew install libpq`) |
| `Service account not found` | Save JSON to `./secrets/firebase-admin.json` |
| Auth import UID conflict | Delete test users in Firebase Auth console first, or import to empty project |
| Firestore count mismatch on skipped tables | Expected for ephemeral tables; check `MAPPING` in `scripts/import-firebase.mjs` |
