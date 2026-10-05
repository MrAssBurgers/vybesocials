// Real SDK boundary checks against the retained, isolated demo only.
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, getDocFromServer, setDoc, updateDoc, deleteDoc, getDocs, collection, query, where, terminate } from 'firebase/firestore';
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8280');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9199');
const projectId = 'demo-vybe-preview';
const { initializeApp: initializeAdmin } = await import('../functions/node_modules/firebase-admin/lib/app/index.js');
const { getFirestore: getAdminDb, FieldValue } = await import('../functions/node_modules/firebase-admin/lib/firestore/index.js');
const { getAuth: getAdminAuth } = await import('../functions/node_modules/firebase-admin/lib/auth/index.js');
initializeAdmin({ projectId });
const admin = getAdminDb(), adminAuth = getAdminAuth();
const apps = [], dbs = [];
async function client(name, email) {
  const app = initializeApp({projectId,apiKey:'demo-only'}, name);
  apps.push(app);
  const auth = getAuth(app); connectAuthEmulator(auth,'http://127.0.0.1:9199',{disableWarnings:true});
  const db = getFirestore(app); dbs.push(db); connectFirestoreEmulator(db,'127.0.0.1',8280);
  if (email) await signInWithEmailAndPassword(auth,email,'Vybe-local-preview-only-2026!');
  return db;
}
let checks = 0;
async function denied(action) { await assert.rejects(action, error => error.code === 'permission-denied'); checks++; }
async function allowed(action) { await action(); checks++; }
try {
  const alice = await client('home-alice','alice@vybe.test');
  const bob = await client('home-bob','bob@vybe.test');
  const guest = await client('home-guest');
  const own = doc(alice,'user_preferences','preview-profile-alice');
  const foreign = doc(bob,'user_preferences','preview-profile-alice');
  await allowed(() => getDocFromServer(own));
  await allowed(() => setDoc(own,{user_id:'preview-profile-alice',extra:{home_customization_qa:true}},{merge:true}));
  await denied(() => getDocFromServer(foreign));
  await denied(() => getDocFromServer(doc(guest,'user_preferences','preview-profile-alice')));
  await denied(() => setDoc(foreign,{extra:{foreign:true}},{merge:true}));
  await denied(() => updateDoc(own,{user_id:'preview-profile-bob'}));
  await allowed(() => getDocs(query(collection(alice,'user_preferences'),where('user_id','==','preview-profile-alice'))));
  await denied(() => getDocs(query(collection(bob,'user_preferences'),where('user_id','==','preview-profile-alice'))));
  await denied(() => setDoc(doc(alice,'user_preferences','home-qa-unowned-id'),{user_id:'preview-profile-alice'}));
  // Imported random document IDs remain accessible only through checked ownership.
  const legacy = admin.doc('user_preferences/home-qa-legacy-owned');
  assert.equal((await legacy.get()).exists, false);
  await legacy.set({user_id:'preview-profile-alice',extra:{fixture:true}});
  await allowed(() => getDocFromServer(doc(alice,'user_preferences','home-qa-legacy-owned')));
  await allowed(() => updateDoc(doc(alice,'user_preferences','home-qa-legacy-owned'),{button_sound:'pop'}));
  await denied(() => getDocFromServer(doc(bob,'user_preferences','home-qa-legacy-owned')));
  await allowed(() => deleteDoc(doc(alice,'user_preferences','home-qa-legacy-owned')));
  const uid = 'home-qa-retired';
  await adminAuth.createUser({uid,email:'home-retired@vybe.test',password:'Vybe-local-preview-only-2026!'}).catch(error => { if(error.code !== 'auth/uid-already-exists') throw error; });
  await admin.doc('_account_profile_bindings/'+uid).set({version:1,owner_uid:uid,profile_id:uid,status:'retired'});
  await admin.doc('user_preferences/'+uid).set({user_id:uid});
  const retired = await client('home-retired','home-retired@vybe.test');
  await denied(() => getDocFromServer(doc(retired,'user_preferences',uid)));
  await denied(() => setDoc(doc(retired,'user_preferences',uid),{extra:{probe:true}},{merge:true}));
  console.log('Home preference Rules:', checks, 'checks passed');
} finally {
  // Remove only these exact test markers; preserve layouts and every other fixture.
  await admin.doc('user_preferences/preview-profile-alice').update({'extra.home_customization_qa':FieldValue.delete()});
  await Promise.all(dbs.map(terminate)); await Promise.all(apps.map(deleteApp));
}

