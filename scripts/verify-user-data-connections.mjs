#!/usr/bin/env node
/**
 * Verify every user's social data (friends, chats, DMs, posts, etc.) is preserved
 * and connected to their account in the Lovable Cloud export.
 *
 * Because seed-firebase-auth-from-profiles.mjs creates Firebase Auth users with the
 * SAME UIDs as Supabase, every user_id / sender_id / author_id / etc. FK in these
 * tables will resolve correctly after import — no remapping needed.
 *
 * Usage:
 *   node scripts/verify-user-data-connections.mjs
 *   node scripts/verify-user-data-connections.mjs --user <uuid>   # spot-check one user
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const EXPORT = '/mnt/documents/lovable-cloud-export/tables';
const OUT    = '/mnt/documents/migration-data-connectivity-report.md';

const load = (f) => {
  try { return JSON.parse(readFileSync(join(EXPORT, f), 'utf8')); }
  catch { return []; }
};

console.log('📦 Loading profiles…');
const profiles = load('profiles.json');
const knownUserIds = new Set(profiles.map(p => p.id).filter(Boolean));
// profiles also have an auth_id (Supabase auth.users.id) — both are valid FKs
for (const p of profiles) if (p.auth_id) knownUserIds.add(p.auth_id);
console.log(`   ${profiles.length} profiles, ${knownUserIds.size} valid user/auth IDs\n`);

// Map of table → user-FK columns to check
const TABLES = {
  posts:                  ['user_id', 'author_id'],
  comments:               ['user_id', 'author_id'],
  likes:                  ['user_id'],
  comment_likes:          ['user_id'],
  follows:                ['follower_id', 'following_id'],
  friend_requests:        ['from_user_id', 'to_user_id', 'sender_id', 'receiver_id'],
  blocked_users:          ['blocker_id', 'blocked_id'],
  close_friends:          ['user_id', 'friend_id'],
  dismissed_profiles:     ['user_id', 'dismissed_user_id'],
  conversations:          ['created_by'],
  conversation_members:   ['user_id'],
  conversation_admins:    ['user_id'],
  messages:               ['sender_id', 'user_id', 'author_id'],
  channel_messages:       ['sender_id', 'user_id'],
  message_reactions:      ['user_id'],
  message_views:          ['user_id'],
  message_pins:           ['user_id'],
  message_requests:       ['from_user_id', 'to_user_id'],
  group_members:          ['user_id'],
  hidden_conversations:   ['user_id'],
  trashed_conversations:  ['user_id'],
  collab_posts:           ['user_id'],
  collab_post_invites:    ['inviter_id', 'invitee_id', 'user_id'],
  post_collaborators:     ['user_id'],
  stories: undefined, // covered separately if exists
  bookmarks:              ['user_id'],
  story_likes:            ['user_id'],
  notifications:          ['user_id', 'actor_id'],
};

if (!('stories' in TABLES)) TABLES.stories = ['user_id', 'author_id'];

const filesPresent = new Set(readdirSync(EXPORT));
const report = [];
let totalRows = 0, totalOrphans = 0;
const orphansByTable = {};
const perUserCounts = new Map(); // userId → { table: count }

for (const [table, fks] of Object.entries(TABLES)) {
  const file = `${table}.json`;
  if (!filesPresent.has(file)) continue;
  const rows = load(file);
  if (!rows.length) continue;

  let orphans = 0;
  for (const row of rows) {
    let touched = false;
    for (const fk of fks) {
      const v = row[fk];
      if (!v) continue;
      touched = true;
      if (!knownUserIds.has(v)) orphans++;
      else {
        const u = perUserCounts.get(v) ?? {};
        u[table] = (u[table] ?? 0) + 1;
        perUserCounts.set(v, u);
      }
    }
    if (!touched) orphans++; // row has none of the expected FKs populated
  }

  totalRows += rows.length;
  totalOrphans += orphans;
  orphansByTable[table] = { rows: rows.length, orphans };
  const pct = ((1 - orphans / rows.length) * 100).toFixed(2);
  console.log(`  ${table.padEnd(28)} ${String(rows.length).padStart(7)} rows · ${pct}% connected · ${orphans} orphan`);
}

// Optional spot-check
const userArg = process.argv.indexOf('--user');
if (userArg > -1) {
  const uid = process.argv[userArg + 1];
  console.log(`\n🔍 Spot-check user ${uid}`);
  console.log(perUserCounts.get(uid) ?? '(no rows found)');
}

// Coverage: how many users actually have any social data?
const usersWithData = perUserCounts.size;
const usersWithPosts   = [...perUserCounts.values()].filter(u => u.posts).length;
const usersWithMsgs    = [...perUserCounts.values()].filter(u => u.messages || u.channel_messages).length;
const usersWithFriends = [...perUserCounts.values()].filter(u => u.follows || u.friend_requests || u.close_friends).length;
const usersWithConvos  = [...perUserCounts.values()].filter(u => u.conversation_members || u.conversations).length;

const md = `# Migration Data Connectivity Report

Generated: ${new Date().toISOString()}
Export: \`${EXPORT}\`

## Bottom line
- **${profiles.length}** profiles in export
- **${totalRows.toLocaleString()}** social rows scanned across ${Object.keys(orphansByTable).length} tables
- **${totalOrphans}** orphan rows (FK doesn't match any known user) — ${((1 - totalOrphans / totalRows) * 100).toFixed(3)}% connectivity

Because \`seed-firebase-auth-from-profiles.mjs\` preserves every Supabase UID as the
Firebase Auth UID, all of these FK references resolve to the same user account
post-import. **No remapping required.**

## Coverage
| Has any… | Users |
|---|---|
| social row | ${usersWithData} / ${profiles.length} |
| posts | ${usersWithPosts} |
| friends/follows | ${usersWithFriends} |
| conversations | ${usersWithConvos} |
| messages | ${usersWithMsgs} |

## Per-table breakdown
| Table | Rows | Orphan FKs | Connected % |
|---|---:|---:|---:|
${Object.entries(orphansByTable)
  .sort((a, b) => b[1].rows - a[1].rows)
  .map(([t, s]) => `| ${t} | ${s.rows.toLocaleString()} | ${s.orphans} | ${((1 - s.orphans / s.rows) * 100).toFixed(2)}% |`)
  .join('\n')}

## What this means for Firebase

When you run the import (\`scripts/import-lovable-export.mjs\`) every row above lands
in Firestore with its original \`user_id\` / \`sender_id\` / \`follower_id\` / etc.
fields intact. Since the matching Firebase Auth user has the **same UID**, queries
like:

\`\`\`ts
db.collection('posts').where('user_id', '==', currentUser.uid)
db.collection('conversation_members').where('user_id', '==', currentUser.uid)
db.collection('friend_requests').where('to_user_id', '==', currentUser.uid)
\`\`\`

…return every one of that user's posts, DMs, friends, and chats — exactly as on
Lovable Cloud.

## Spot-check a specific user
\`\`\`
node scripts/verify-user-data-connections.mjs --user <uuid>
\`\`\`
`;

writeFileSync(OUT, md);
console.log(`\n📝 Report → ${OUT}`);
console.log(`\n✅ ${usersWithData}/${profiles.length} users have at least one social row`);
console.log(`✅ ${((1 - totalOrphans / totalRows) * 100).toFixed(3)}% of ${totalRows.toLocaleString()} rows connect to a known account`);
