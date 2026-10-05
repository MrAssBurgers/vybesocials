import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8280');
const require = createRequire(path.resolve(process.env.FIREBASE_TEST_TOOLS_ROOT || '.', 'package.json'));
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, getDocs, collection, query, where, setLogLevel } = require('firebase/firestore');
setLogLevel('silent');
const before = await readFile('releases/profile-bootstrap-20261005/firestore.rules','utf8');
const candidate = await readFile('releases/home-customization-20261005/firestore.rules','utf8');
const current = await readFile('firestore.rules','utf8');
const block = /    match \/user_preferences\/\{docId\} \{[\s\S]*?\n    \}\n/;
assert.equal(before.replace(block,'PREFERENCES'),candidate.replace(block,'PREFERENCES'),'Candidate must change only preferences');
let checks = 0;
for (const [name, rules] of [['demo-home-before',before],['demo-home-candidate',candidate],['demo-home-current',current]]) {
  // Distinct emulator project namespaces never clear or replace the retained preview.
  const env = await initializeTestEnvironment({projectId:name,firestore:{host:'127.0.0.1',port:8280,rules}});
  try {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async ctx => {
      const db = ctx.firestore();
      for (const uid of ['alice','bob']) {
        await setDoc(doc(db,'profiles','legacy-'+uid),{user_id:uid});
        await setDoc(doc(db,'user_auth_index',uid),{profile_id:'legacy-'+uid,owner_uid:uid});
        await setDoc(doc(db,'_account_profile_bindings',uid),{version:1,owner_uid:uid,profile_id:'legacy-'+uid,status:'active'});
      }
      await setDoc(doc(db,'user_preferences','legacy-random-document'),{user_id:'legacy-alice',extra:{saved:true}});
      await setDoc(doc(db,'_account_profile_bindings','retired'),{version:1,owner_uid:'retired',profile_id:'retired',status:'retired'});
      await setDoc(doc(db,'profiles','deleted-alice'),{user_id:'alice',is_deleted:true});
      await setDoc(doc(db,'profiles','collision'),{user_id:'bob'});
      await setDoc(doc(db,'user_preferences','collision'),{user_id:'collision'});
    });
    const alice = env.authenticatedContext('alice').firestore();
    const bob = env.authenticatedContext('bob').firestore();
    const own = doc(alice,'user_preferences','legacy-alice');
    if (name === 'demo-home-before') {
      await assertFails(getDoc(own)); checks++;
      console.log('Exact live baseline reproduces missing migrated-preference read denial');
      continue;
    }
    const allow = async task => { await assertSucceeds(task); checks++; };
    const deny = async task => { await assertFails(task); checks++; };
    await allow(getDoc(own));
    await allow(setDoc(own,{user_id:'legacy-alice',extra:{grid_layout:{widgets:[]}}},{merge:true}));
    await allow(updateDoc(own,{'extra.grid_layout.widgets':[{id:'feed',order:0,enabled:true}]}));
    await allow(getDocs(query(collection(alice,'user_preferences'),where('user_id','==','legacy-alice'))));
    await deny(getDocs(query(collection(bob,'user_preferences'),where('user_id','==','legacy-alice'))));
    await deny(getDoc(doc(bob,'user_preferences','legacy-alice')));
    await deny(setDoc(doc(bob,'user_preferences','legacy-alice'),{extra:{other:true}},{merge:true}));
    await deny(updateDoc(own,{user_id:'legacy-bob'}));
    await deny(setDoc(doc(alice,'user_preferences','arbitrary-document'),{user_id:'legacy-alice'}));
    await allow(getDoc(doc(alice,'user_preferences','legacy-random-document')));
    await allow(updateDoc(doc(alice,'user_preferences','legacy-random-document'),{button_sound:'pop'}));
    await deny(getDoc(doc(bob,'user_preferences','legacy-random-document')));
    await deny(getDoc(doc(env.unauthenticatedContext().firestore(),'user_preferences','legacy-alice')));
    await deny(setDoc(doc(alice,'user_preferences','deleted-alice'),{user_id:'deleted-alice'}));
    await deny(getDoc(doc(env.authenticatedContext('collision').firestore(),'user_preferences','collision')));
    await deny(getDoc(doc(env.authenticatedContext('retired').firestore(),'user_preferences','retired')));
  } finally { await env.cleanup(); }
}
console.log('Exact baseline/current/candidate preferences:', checks, 'checks passed');
