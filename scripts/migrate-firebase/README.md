# Lovable Cloud → Firebase migration (final steps)

The 208 public tables are already exported to `lovable-cloud-export/`. These three
scripts finish the migration locally (they need credentials the sandbox cannot hold).

## Prereqs
- Node 20+
- A Firebase service account JSON at `./secrets/firebase-admin.json`
- `bun add firebase-admin mime` (or `npm i`)

## Env
```bash
export GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin.json
export FIREBASE_PROJECT_ID=vybe-daaab

# For storage download only (calls the Cloud edge function):
export SUPABASE_URL=https://agtcyxjxgkdyoxwxkjth.supabase.co
export SUPABASE_ANON_KEY=<publishable anon key>
export MIGRATION_EXPORT_TOKEN=<the secret you set in Lovable>
```

## Steps
```bash
# 1) Seed Firebase Auth users (preserves UIDs, no passwords)
node scripts/migrate-firebase/seed-firebase-auth-from-profiles.mjs

# 2) Download every storage bucket file via the edge function
node scripts/migrate-firebase/download-cloud-storage.mjs

# 3) Upload everything to Firebase Storage
node scripts/migrate-firebase/upload-firebase-storage.mjs

# 4) Import tables to Firestore (script already in the export bundle)
cd lovable-cloud-export && node import-to-firestore.mjs
```

## Notes
- Password hashes from `auth.users` are NOT exportable from Lovable Cloud
  (platform constraint, confirmed by Lovable support). Email/password users
  will do "Forgot password" once on Firebase. Google/OAuth re-links automatically.
- Storage files preserve their original `<bucket>/<path>` layout.
- The edge function is gated by `MIGRATION_EXPORT_TOKEN` — delete the function
  after migration completes.
