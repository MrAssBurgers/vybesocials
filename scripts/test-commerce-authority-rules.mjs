import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const projectId = process.env.GCLOUD_PROJECT || 'demo-vybe-creators';
assert.ok(projectId.startsWith('demo-'), 'Use a demo- project for fixture writes');
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
const require = createRequire(path.resolve(process.env.FIREBASE_TEST_TOOLS_ROOT || '.', 'package.json'));
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, setDoc, getDoc, updateDoc, deleteDoc } = require('firebase/firestore');
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
const env = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(port), rules: await readFile('firestore.rules', 'utf8') } });
let checks = 0;
async function yes(label, action) { await assertSucceeds(action()); checks++; console.log(`PASS ${label}`); }
async function no(label, action) { await assertFails(action()); checks++; console.log(`PASS ${label}`); }
const aliceId = 'commerce-alice';
const bobId = 'commerce-bob';
const aliceProfile = 'commerce-alice-profile';
const bobProfile = 'commerce-bob-profile';
const alice = env.authenticatedContext(aliceId).firestore();
const bob = env.authenticatedContext(bobId).firestore();
const admin = env.authenticatedContext('commerce-admin', { admin: true }).firestore();
const guest = env.unauthenticatedContext().firestore();
const ownProfile = fields => ({ id: aliceId, user_id: aliceId, username: 'fixture', ...fields });
const application = fields => ({ user_id: aliceId, applied_at: '2026-10-03T00:00:00Z', ...fields });
const product = fields => ({ business_id: 'alice-business', title: 'Fixture', price: 10, ...fields });

try {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'profiles', aliceProfile), { id: aliceProfile, user_id: aliceId, stripe_customer_id: 'cus_fixture_alice', username: 'alice' });
    await setDoc(doc(db, 'profiles', bobProfile), { id: bobProfile, user_id: bobId, username: 'bob' });
    await setDoc(doc(db, 'user_auth_index', aliceId), { profile_id: aliceProfile });
    await setDoc(doc(db, 'user_auth_index', bobId), { profile_id: bobProfile });
    await setDoc(doc(db, 'creator_profiles', aliceId), application({ stripe_account_id: 'acct_fixture_alice', is_approved: false, balance: 12 }));
    await setDoc(doc(db, 'business_profiles', 'alice-business'), { owner_id: aliceProfile, name: 'Alice shop', stripe_account_id: 'acct_fixture_alice', total_revenue: 40 });
    await setDoc(doc(db, 'business_profiles', 'bob-business'), { owner_id: bobId, name: 'Bob shop' });
    await setDoc(doc(db, 'business_products', 'paid-product'), product({ stripe_price_id: 'price_fixture', owner_user_id: aliceId, platform_fee_percent: 15 }));
    await setDoc(doc(db, 'business_products', 'draft-product'), product({}));
  });

  await no('new profile cannot impersonate a different auth account', () => setDoc(doc(alice, 'profiles', aliceId), ownProfile({ user_id: bobId })));
  await no('new profile cannot claim another profile identity', () => setDoc(doc(alice, 'profiles', aliceId), ownProfile({ id: bobProfile })));
  for (const key of ['stripe_customer_id', 'stripe_account_id']) {
    await no(`new profile cannot inject ${key}`, () => setDoc(doc(alice, 'profiles', aliceId), ownProfile({ [key]: 'foreign_mapping' })));
    for (const [label, client] of [['owner', alice], ['outsider', bob], ['admin client', admin]]) {
      await no(`${label} cannot change profile ${key}`, () => updateDoc(doc(client, 'profiles', aliceProfile), { [key]: 'foreign_mapping' }));
    }
  }
  await yes('normal canonical profile creation still works', () => setDoc(doc(alice, 'profiles', aliceId), ownProfile({})));
  await yes('legacy profile owner can edit appearance', () => updateDoc(doc(alice, 'profiles', aliceProfile), { bio: 'Updated fixture' }));
  await no('legacy profile cannot change auth ownership', () => updateDoc(doc(alice, 'profiles', aliceProfile), { user_id: bobId }));
  await no('profile cannot change its stored ID', () => updateDoc(doc(alice, 'profiles', aliceProfile), { id: bobProfile }));
  await no('outsider cannot edit profile content', () => updateDoc(doc(bob, 'profiles', aliceProfile), { bio: 'Unwanted edit' }));
  await yes('owner can still save a profile subcollection document', () => setDoc(doc(alice, 'profiles', aliceProfile, 'preferences', 'fixture'), { theme: 'dark' }));
  await no('outsider cannot edit another profile subcollection', () => updateDoc(doc(bob, 'profiles', aliceProfile, 'preferences', 'fixture'), { theme: 'forged' }));

  await no('outsider cannot claim an existing payment profile', () => updateDoc(doc(bob, 'creator_profiles', aliceId), { user_id: bobId }));
  await no('another canonical payment profile cannot be preallocated', () => setDoc(doc(bob, 'creator_profiles', 'future-owner'), { user_id: bobId, applied_at: 'fixture' }));
  for (const field of ['stripe_account_id', 'stripe_customer_id', 'balance', 'total_earnings', 'platform_fee_percent']) {
    await no(`creator application cannot inject ${field}`, () => setDoc(doc(bob, 'creator_profiles', bobId), { user_id: bobId, [field]: 123 }));
    for (const [label, client] of [['owner', alice], ['admin client', admin]]) {
      await no(`${label} cannot change creator ${field}`, () => updateDoc(doc(client, 'creator_profiles', aliceId), { [field]: 'changed' }));
    }
  }
  await no('creator cannot self-approve', () => updateDoc(doc(alice, 'creator_profiles', aliceId), { is_approved: true }));
  await yes('creator can submit a new application', () => setDoc(doc(bob, 'creator_profiles', bobId), { user_id: bobId, applied_at: 'fixture', is_approved: false }));
  await yes('creator can update application timestamp', () => updateDoc(doc(alice, 'creator_profiles', aliceId), { applied_at: 'new timestamp' }));
  await yes('staff can review without editing payment mapping', () => updateDoc(doc(admin, 'creator_profiles', aliceId), { is_approved: true, approved_at: 'fixture', tier: 'emerging' }));
  await no('creator cannot unset staff approval', () => updateDoc(doc(alice, 'creator_profiles', aliceId), { is_approved: false }));
  await env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), 'creator_profiles', 'legacy-missing-approval'), { user_id: aliceId, stripe_account_id: 'acct_fixture_alice' }));
  await no('legacy missing approval cannot self-approve', () => updateDoc(doc(alice, 'creator_profiles', 'legacy-missing-approval'), { is_approved: true }));
  await yes('legacy missing approval can join pending application queue', () => updateDoc(doc(alice, 'creator_profiles', 'legacy-missing-approval'), { applied_at: 'fixture', is_approved: false }));

  for (const key of ['owner_id', 'stripe_account_id', 'stripe_onboarding_complete', 'is_verified', 'total_revenue', 'rating_average']) {
    await no(`business owner cannot replace authority field ${key}`, () => updateDoc(doc(alice, 'business_profiles', 'alice-business'), { [key]: 'forged' }));
  }
  await no('business cannot be claimed by a different owner', () => updateDoc(doc(bob, 'business_profiles', 'alice-business'), { owner_id: bobId, name: 'Taken' }));
  await yes('legacy owner can edit business description', () => updateDoc(doc(alice, 'business_profiles', 'alice-business'), { description: 'Updated' }));
  await yes('legacy owner can create a business', () => setDoc(doc(alice, 'business_profiles', 'new-business'), { owner_id: aliceProfile, name: 'New shop', slug: 'new' }));
  await no('business creation cannot inject a payment mapping', () => setDoc(doc(alice, 'business_profiles', 'injected-business'), { owner_id: aliceProfile, name: 'Shop', stripe_account_id: 'acct_foreign' }));
  for (const [label, client] of [['owner', alice], ['outsider', bob], ['admin client', admin]]) {
    await no(`${label} cannot delete a business parent and free its namespace`, () => deleteDoc(doc(client, 'business_profiles', 'alice-business')));
    await no(`${label} cannot delete a bound checkout classification`, () => deleteDoc(doc(client, 'business_products', 'paid-product')));
  }
  await no('another owner cannot recreate the protected parent', () => setDoc(doc(bob, 'business_profiles', 'alice-business'), { owner_id: bobId, name: 'Claimed' }));
  await yes('business owner can archive its business', () => updateDoc(doc(alice, 'business_profiles', 'alice-business'), { is_active: false }));
  await yes('business owner can archive a bound product', () => updateDoc(doc(alice, 'business_products', 'paid-product'), { is_active: false }));

  await yes('business owner can create a catalog draft', () => setDoc(doc(alice, 'business_products', 'new-product'), product({})));
  await no('outsider cannot add a product to another business', () => setDoc(doc(bob, 'business_products', 'bad-product'), product({})));
  for (const key of ['owner_id', 'owner_user_id', 'user_id', 'business_owner_id', 'stripe_price_id', 'stripe_product_id', 'platform_fee_percent']) {
    await no(`new product cannot assign checkout field ${key}`, () => setDoc(doc(alice, 'business_products', 'bad-new-product'), product({ [key]: 'foreign' })));
    for (const [label, client] of [['owner', alice], ['outsider', bob], ['admin client', admin]]) {
      await no(`${label} cannot change product checkout field ${key}`, () => updateDoc(doc(client, 'business_products', 'paid-product'), { [key]: 'foreign' }));
    }
  }
  await no('product cannot be reassigned to another business', () => updateDoc(doc(alice, 'business_products', 'paid-product'), { business_id: 'bob-business' }));
  await no('bound Stripe price cannot diverge from catalog price', () => updateDoc(doc(alice, 'business_products', 'paid-product'), { price: 1 }));
  await yes('unbound catalog draft price is editable', () => updateDoc(doc(alice, 'business_products', 'draft-product'), { price: 12 }));
  await yes('bound catalog description remains editable', () => updateDoc(doc(alice, 'business_products', 'paid-product'), { description: 'Updated' }));
  await no('outsider cannot delete a product', () => deleteDoc(doc(bob, 'business_products', 'paid-product')));
  await no('guests cannot read commerce records', () => getDoc(doc(guest, 'business_products', 'paid-product')));
  await yes('signed-in users can view public catalog content', () => getDoc(doc(bob, 'business_products', 'paid-product')));
  await yes('business owner can remove its draft product', () => deleteDoc(doc(alice, 'business_products', 'draft-product')));
  console.log(`Commerce authority rules: ${checks} checks passed`);
} finally { await env.cleanup(); }
