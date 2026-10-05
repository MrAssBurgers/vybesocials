import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
const projectId = process.env.GCLOUD_PROJECT;
assert.match(projectId || '', /^demo-[a-z0-9-]+$/);
assert.notEqual(projectId, 'demo-vybe-preview');
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
const require = createRequire(path.resolve(process.env.FIREBASE_TEST_TOOLS_ROOT || '.', 'package.json'));
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, collection, query, where, getDoc, getDocs, setDoc, updateDoc, deleteDoc, setLogLevel } = require('firebase/firestore');
setLogLevel('silent');
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
const env = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(port), rules: await readFile('firestore.rules', 'utf8') } });
const owner = env.authenticatedContext('dna-owner').firestore();
const other = env.authenticatedContext('dna-other').firestore();
const guest = env.unauthenticatedContext().firestore();
let checks = 0;
try {
  for (const name of ['dna_agent_actions', 'dna_auto_theme', 'dna_content_preferences']) {
    await env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), name, 'dna-fixture'), { user_id: 'dna-owner' }));
    await assertSucceeds(getDoc(doc(owner, name, 'dna-fixture'))); checks++;
    await assertSucceeds(getDocs(query(collection(owner, name), where('user_id', '==', 'dna-owner')))); checks++;
    for (const client of [other, guest]) { await assertFails(getDoc(doc(client, name, 'dna-fixture'))); checks++; }
    await assertFails(getDocs(collection(owner, name))); checks++;
    for (const client of [owner, other, guest]) {
      await assertFails(setDoc(doc(client, name, 'dna-fixture'), { user_id: 'dna-owner' })); checks++;
      await assertFails(deleteDoc(doc(client, name, 'dna-fixture'))); checks++;
      await assertFails(setDoc(doc(client, name, 'after-reset'), { user_id: 'dna-owner' })); checks++;
    }
    await assertFails(updateDoc(doc(other, name, 'dna-fixture'), { user_id: 'dna-other' })); checks++;
  }
  for (const name of ['_dna_adaptation_state', '_dna_adaptation_resets', '_dna_action_plans', '_dna_action_receipts', '_dna_action_limits']) {
    await env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), name, 'dna-owner'), { owner_uid: 'dna-owner' }));
    for (const client of [owner, env.authenticatedContext('admin', { admin: true }).firestore()]) {
      await assertFails(getDoc(doc(client, name, 'dna-owner'))); checks++;
      await assertFails(setDoc(doc(client, name, 'dna-owner'), { resetting: false })); checks++;
    }
  }
  await assertFails(setDoc(doc(owner, 'dna_agent_settings', 'dna-owner'), { user_id: 'dna-owner', mode: 'off', learning_paused: true })); checks++;
  await env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), 'dna_agent_settings', 'dna-owner'), { user_id: 'dna-owner', mode: 'suggest' }));
  await assertFails(updateDoc(doc(owner, 'dna_agent_settings', 'dna-owner'), { personalization_opted_out: true })); checks++;
  await assertFails(updateDoc(doc(other, 'dna_agent_settings', 'dna-owner'), { user_id: 'dna-other', learning_paused: false })); checks++;
  await assertFails(setDoc(doc(other, 'dna_agent_settings', 'dna-owner'), { user_id: 'dna-other', mode: 'autonomous' })); checks++;
  await assertFails(updateDoc(doc(owner, 'dna_agent_settings', 'dna-owner'), { user_id: 'dna-other' })); checks++;
  await assertFails(setDoc(doc(other, 'dna_agent_settings', 'arbitrary'), { user_id: 'dna-other', mode: 'suggest' })); checks++;
  await assertSucceeds(getDocs(query(collection(owner, 'dna_agent_settings'), where('user_id', '==', 'dna-owner')))); checks++;
} finally { await env.cleanup(); }
console.log(`DNA adaptation rules passed ${checks} checks`);
