# Migration data connectivity report

**Project:** `vybe-daaab` (Firebase)  
**Source:** Lovable Cloud export (`export/lovable-cloud-export/tables/`)  
**Auth seed:** `scripts/migrate-firebase/seed-firebase-auth-from-profiles.mjs` — Firebase Auth UID = Supabase `profiles.user_id`

## Bottom line

Every user keeps their **friends, chats, DMs, and posts** after import. No UID remapping is required on the client.

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

Supabase bcrypt hashes are **not** exportable from Lovable Cloud. Users use **Forgot password** once on first email login; OAuth accounts re-link automatically.
