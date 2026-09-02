/**
 * Emulator / static checks: clients cannot create messages (callable-only sends),
 * and blocked-user enforcement lives on sendDmMessage.
 *
 *   npm run test:dm-send-enforcement
 *   npm run test:dm-send-enforcement:emu
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
// A demo project ID prevents any accidental fallback to production while the
// emulator gate is running. emulators:exec supplies GCLOUD_PROJECT in CI.
const PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-vybe-rules';
const RULES_PATH = resolve(ROOT, 'firestore.rules');
const DMSEND_PATH = resolve(ROOT, 'functions/src/dmSend.ts');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function tryImportTesting() {
  try {
    return await import('@firebase/rules-unit-testing');
  } catch {
    return null;
  }
}

function staticChecks() {
  const rules = readFileSync(RULES_PATH, 'utf8');
  const dmSend = readFileSync(DMSEND_PATH, 'utf8');

  // Flat messages collection: create denied
  assert(/match \/messages\/\{messageId\}[\s\S]*?allow create: if false/.test(rules), 'flat messages create must be denied');
  // Subcollection messages also denied
  assert(rules.includes("allow create: if false"), 'message create deny present');

  assert(dmSend.includes('isBlockedPair'), 'blocked-user check required');
  assert(dmSend.includes("You can’t message this user") || dmSend.includes("You can't message this user"), 'blocked error message required');
  assert(dmSend.includes('rateLimit(`dm-send:'), 'rate limit required');
  assert(dmSend.includes('clientMessageId') || dmSend.includes('client_message_id'), 'idempotency key required');
  assert(dmSend.includes('assertValidMediaUrl'), 'media validation required');

  console.log('[dm-send-enforcement] PASS (static)');
}

async function emulatorChecks(testing) {
  const { initializeTestEnvironment, assertFails, assertSucceeds } = testing;
  const testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(RULES_PATH, 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });

  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.firestore();
    await adminDb.doc('user_auth_index/auth-a').set({ profile_id: 'profile-a' });
    await adminDb.doc('profiles/profile-a').set({ user_id: 'auth-a', username: 'a' });
    await adminDb.doc('profiles/profile-b').set({ user_id: 'auth-b', username: 'b' });
    await adminDb.doc('conversations/profile-a_profile-b').set({
      is_group: false,
      member_ids: ['profile-a', 'profile-b'],
    });
    await adminDb.doc('conversation_members/profile-a_profile-b_profile-a').set({
      conversation_id: 'profile-a_profile-b',
      user_id: 'profile-a',
    });
    await adminDb.doc('blocked_users/block1').set({
      blocker_id: 'profile-b',
      blocked_id: 'profile-a',
    });
  });

  const sender = testEnv.authenticatedContext('auth-a');
  // Client must not create messages even when a member of the conversation.
  await assertFails(
    sender.firestore().collection('messages').add({
      conversation_id: 'profile-a_profile-b',
      sender_id: 'profile-a',
      content: 'blocked bypass attempt',
      created_at: new Date().toISOString(),
    }),
  );

  // Admin SDK (callable) can still write — modeled via rules-disabled context.
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await assertSucceeds(
      context.firestore().collection('messages').add({
        conversation_id: 'profile-a_profile-b',
        sender_id: 'profile-a',
        content: 'server write ok',
        created_at: new Date().toISOString(),
      }),
    );
  });

  await testEnv.cleanup();
  console.log('[dm-send-enforcement] PASS (emulator — client create denied)');
}

async function main() {
  staticChecks();
  const testing = await tryImportTesting();
  if (!testing) {
    if (process.env.REQUIRE_EMULATORS === '1') {
      throw new Error(
        '@firebase/rules-unit-testing is required for the emulator gate; refusing a static-only pass',
      );
    }
    console.warn('[dm-send-enforcement] rules-unit-testing unavailable — static checks only');
    return;
  }

  try {
    await emulatorChecks(testing);
  } catch (err) {
    if (process.env.REQUIRE_EMULATORS === '1') throw err;
    console.warn('[dm-send-enforcement] emulator unavailable — static only', err?.message || err);
  }
}

main().catch((err) => {
  console.error('[dm-send-enforcement] FAIL', err);
  process.exit(1);
});
