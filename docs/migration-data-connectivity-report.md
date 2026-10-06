# Historical migration data connectivity report

This report describes references in the old export, not verified current access
to production accounts or content. Do not run the historical Auth seed or repair
scripts as an account-recovery procedure: a public profile email or seeded index
does not independently establish ownership.

A read-only production review on 2026-10-06 sampled the latest 120 profiles.
77 referenced UIDs were absent from Firebase Auth. All 77 had matching historical
indices, but none had protected account bindings, foreign indices, retirement
transfers or reviewed recovery records. Queries by those UIDs found no posts and
10 sent messages across two profiles. These counts are limited to the sample and
those exact fields; they do not establish a complete migration or data loss.

The other 43 sampled profiles had enabled Auth accounts: one had a current
binding/index, 41 had legacy indices without bindings and one lacked both.
Returning users with an unchanged, authenticated UID use the canonical profile
setup checks. Transferring a legacy profile to another UID requires independently
reviewed ownership evidence and the existing recovery authority. Never infer a
new owner from email/name matches, create replacement Auth users from public
profiles, or rewrite content ownership to make this historical report appear true.

**Project:** `vybe-daaab` (Firebase)  
**Source:** Lovable Cloud export (`export/lovable-cloud-export/tables/`)  
**Auth seed:** `scripts/migrate-firebase/seed-firebase-auth-from-profiles.mjs` — Firebase Auth UID = Supabase `profiles.user_id`

## Bottom line

The historical export referenced the original profile UIDs. Keeping those UIDs
would preserve these references, but this table does not verify that the matching
Auth accounts exist today or that clients can read the corresponding content.

| Metric | Result |
|--------|--------|
| Profiles preserved | **152 / 152** with Supabase auth UIDs |
| Social refs scanned | **2,092** |
| Connected to known account | **98.66%** |
| Core social tables | **100%** connectivity on posts, follows, friend_requests, messages, message_views, conversation_members, stories, notifications |

## Why it works

1. `seed-firebase-auth-from-profiles.mjs` creates each Firebase Auth user with **the same UID** as Supabase.
2. Every `user_id`, `sender_id`, `follower_id`, `to_user_id`, etc. in the export already references that UID.
3. After `import-lovable-export.mjs`, client queries work unchanged:

```javascript
db.collection('posts').where('user_id', '==', currentUser.uid)
db.collection('conversation_members').where('user_id', '==', uid)
db.collection('follows').where('follower_id', '==', uid)
db.collection('messages').where('sender_id', '==', uid)
```

## Known orphans (not user data loss)

**28 conversations** have `created_by = null` — system/group threads seeded without a creator field.  
**100%** of members remain attached via `conversation_members`; no one loses chat access.

## Per-table notes

| Table | Connectivity | Notes |
|-------|--------------|-------|
| `posts` | 100% | `user_id` → profile UID |
| `follows` | 100% | `follower_id`, `following_id` |
| `friend_requests` | 100% | `from_user_id`, `to_user_id` |
| `messages` | 100% | `sender_id` |
| `message_views` | 100% | `user_id` |
| `conversation_members` | 100% | `user_id` |
| `conversations` | 100% on members; 28 null `created_by` | Group/system threads |
| `stories` | 100% | `user_id` |
| `notifications` | 100% | `user_id`; optional `from_user_id` |
| `comments` | 100% | `user_id` |
| `vybe_dna` | 100% | `user_id` |
| `dna_agent_actions` | 100% | `user_id` |

## Re-run verification

```bash
# Export JSON (offline)
node scripts/verify-user-data-connections.mjs

# Spot-check one user
node scripts/verify-user-data-connections.mjs --user 703760a8-1245-4fc1-b242-32619ecc0ef3

# After Firestore import — collection counts
GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin.json \
FIREBASE_PROJECT_ID=vybe-daaab \
node scripts/verify-user-data-connections.mjs --firestore
```

## Passwords

The historical export did not include usable password hashes. Password reset
requires an existing Firebase Auth account. OAuth sign-in must not be assumed to
relink a legacy profile automatically; current authenticated identity and reviewed
recovery evidence determine the profile connection.
