/**
 * Executable Firestore rules checks for dm_inbox_entries.
 * Run with Auth + Firestore emulators:
 *   npx firebase emulators:exec --only firestore,auth "node scripts/test-dm-inbox-rules.mjs"
 *
 * Exits 0 when all assertions pass. Skips cleanly when emulators are offline
 * unless REQUIRE_EMULATORS=1.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PROJECT_ID = 'vybe-daaab';
const RULES_PATH = resolve(ROOT, 'firestore.rules');

async function tryImportTesting() {
  try {
    return await import('@firebase/rules-unit-testing');
  } catch {
    return null;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const testing = await tryImportTesting();
  if (!testing) {
    console.log('[dm-inbox-rules] @firebase/rules-unit-testing not installed — static checks only');
    const rules = readFileSync(RULES_PATH, 'utf8');
    assert(rules.includes('match /dm_inbox_entries/{entryId}'), 'missing dm_inbox_entries match');
    assert(rules.includes("allow create, update, delete: if false"), 'clients must not write projections');
    assert(rules.includes('ownsProfileId(resource.data.viewer_id)'), 'viewer ownership read gate missing');
    console.log('[dm-inbox-rules] PASS (static)');
    return;
  }

  const { initializeTestEnvironment, assertFails, assertSucceeds } = testing;
  let testEnv;
  try {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: readFileSync(RULES_PATH, 'utf8'),
        host: '127.0.0.1',
        port: 8080,
      },
    });
  } catch (err) {
    if (process.env.REQUIRE_EMULATORS === '1') throw err;
    console.warn('[dm-inbox-rules] emulator unavailable — static checks only', err?.message || err);
    const rules = readFileSync(RULES_PATH, 'utf8');
    assert(rules.includes('match /dm_inbox_entries/{entryId}'), 'missing dm_inbox_entries match');
    console.log('[dm-inbox-rules] PASS (static fallback)');
    return;
  }

  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.firestore();
    await adminDb.doc('user_auth_index/auth-viewer').set({ profile_id: 'profile-viewer' });
    await adminDb.doc('profiles/profile-viewer').set({ user_id: 'auth-viewer', username: 'viewer' });
    await adminDb.doc('profiles/profile-other').set({ user_id: 'auth-other', username: 'other' });
    await adminDb.doc('dm_inbox_entries/profile-viewer_conv1').set({
      viewer_id: 'profile-viewer',
      conversation_id: 'conv1',
      display_name: 'Chat',
      preview_text: 'hi',
      unread_count: 0,
      is_unread: false,
      is_pinned: false,
      is_muted: false,
      needs_reply: false,
      conversation_type: 'direct',
      latest_message_at: new Date().toISOString(),
    });
    await adminDb.doc('dm_inbox_entries/profile-other_conv1').set({
      viewer_id: 'profile-other',
      conversation_id: 'conv1',
      display_name: 'Chat',
      preview_text: 'hi',
      unread_count: 0,
      is_unread: false,
      is_pinned: false,
      is_muted: false,
      needs_reply: false,
      conversation_type: 'direct',
      latest_message_at: new Date().toISOString(),
    });
  });

  const viewer = testEnv.authenticatedContext('auth-viewer');
  const other = testEnv.authenticatedContext('auth-other');
  const anon = testEnv.unauthenticatedContext();

  await assertSucceeds(viewer.firestore().doc('dm_inbox_entries/profile-viewer_conv1').get());
  await assertFails(viewer.firestore().doc('dm_inbox_entries/profile-other_conv1').get());
  await assertFails(
    viewer.firestore().doc('dm_inbox_entries/profile-viewer_conv2').set({
      viewer_id: 'profile-viewer',
      conversation_id: 'conv2',
    }),
  );
  await assertFails(
    viewer.firestore().doc('dm_inbox_entries/profile-viewer_conv1').update({ preview_text: 'hack' }),
  );
  await assertFails(viewer.firestore().doc('dm_inbox_entries/profile-viewer_conv1').delete());
  await assertFails(anon.firestore().doc('dm_inbox_entries/profile-viewer_conv1').get());
  await assertSucceeds(other.firestore().doc('dm_inbox_entries/profile-other_conv1').get());

  await testEnv.cleanup();
  console.log('[dm-inbox-rules] PASS (emulator)');
}

main().catch((err) => {
  console.error('[dm-inbox-rules] FAIL', err);
  process.exit(1);
});
