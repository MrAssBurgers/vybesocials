import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
assert.equal(process.env.GCLOUD_PROJECT,'demo-vybe-parental-qa');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:9494');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST,'127.0.0.1:9497');
process.env.FIREBASE_CONFIG=JSON.stringify({projectId:process.env.GCLOUD_PROJECT});
const require=createRequire(path.resolve('../qa-tools/package.json'));
const {initializeTestEnvironment,assertFails}=require('@firebase/rules-unit-testing');
const {doc,getDoc,setDoc,updateDoc,deleteDoc}=require('firebase/firestore');
const {db,auth}=await import('../functions/lib/_shared/admin.js');
assert.equal(db.projectId,'demo-vybe-parental-qa');assert.equal(auth.app.options.projectId,'demo-vybe-parental-qa');
const api=await import('../functions/lib/auth.js');
const uid='account-deletion-qa-owner',profileId='account-deletion-qa-profile';let created,groups=0,rulesChecks=0,env;
const id=()=>crypto.randomUUID();
const request=(action='deletion_status',extra={})=>({auth:{uid,token:{auth_time:Math.floor(Date.now()/1000)}},data:{action,requestId:id(),expectedOwnerUid:uid,expectedProfileId:profileId,expectedAccountCreatedAt:created,...extra}});
const run=raw=>api.manageAccount.run(raw);
const check=async(name,fn)=>{await fn();groups++;console.log('PASS '+name)};
const stateRef=db.doc(`account_deletion_requests/${uid}`);
const assertUntouched=async(before)=>assert.deepEqual((await db.doc(`profiles/${profileId}`).get()).data(),before);
try {
  for(const own of [uid,profileId]){try{await auth.deleteUser(own)}catch(error){if(error.code!=='auth/user-not-found')throw error}}
  await auth.createUser({uid});created=Date.parse((await auth.getUser(uid)).metadata.creationTime);
  const clear=await fetch('http://127.0.0.1:9494/emulator/v1/projects/demo-vybe-parental-qa/databases/(default)/documents',{method:'DELETE'});assert.equal(clear.ok,true);
  await db.doc(`profiles/${profileId}`).set({user_id:uid,username:'deletion-qa',avatar_url:'https://example.test/shared'});
  await db.doc(`_account_profile_bindings/${uid}`).set({version:1,status:'active',owner_uid:uid,profile_id:profileId,auth_created_at_ms:created,revision:'a'.repeat(48)});
  await db.doc('posts/retained').set({author_id:profileId,caption:'unchanged'});await db.doc('messages/peer').set({sender_id:'other',content:'peer body'});
  const profileBefore=(await db.doc(`profiles/${profileId}`).get()).data();
  await check('fresh checked read reports no deletion without initializing state',async()=>{const value=await run(request());assert.equal(value.status,'none');assert.equal(value.automaticCleanup,false);assert.equal(value.revision,null);assert.equal((await stateRef.get()).exists,false)});
  let pending,original,intent;
  await check('checked request records durable dates and preserves all account content and Auth',async()=>{intent=request('request_delete',{expectedRevision:null});pending=await run(intent);original=(await stateRef.get()).data();assert.equal(pending.status,'pending_review');assert.equal(Date.parse(pending.eligibleAfter)-Date.parse(pending.requestedAt),30*86400000);assert.equal(pending.automaticCleanup,false);assert.equal((await auth.getUser(uid)).disabled,false);await assertUntouched(profileBefore);assert.equal((await db.doc('posts/retained').get()).exists,true);assert.equal((await db.doc('messages/peer').get()).data().content,'peer body')});
  await check('lost-response retry and concurrent exact intent converge without extending grace',async()=>{const results=await Promise.all([run(intent),run(intent),run(intent)]);for(const value of results)assert.equal(value.revision,pending.revision);assert.deepEqual((await stateRef.get()).data(),original)});
  await check('new deliberate pending request retains original deadline and revision',async()=>{const value=await run(request('request_delete',{expectedRevision:pending.revision}));assert.equal(value.eligibleAfter,pending.eligibleAfter);assert.equal(value.revision,pending.revision);assert.deepEqual((await stateRef.get()).data(),original)});
  await check('stale revision and reused ID with different intent reject unchanged',async()=>{await assert.rejects(run(request('cancel_delete',{expectedRevision:null})),{code:'aborted'});await assert.rejects(run({...intent,data:{...intent.data,action:'cancel_delete'}}),{code:'already-exists'});assert.deepEqual((await stateRef.get()).data(),original)});
  let cancelled,cancelIntent;
  await check('cancel is checked atomic state and durable retry; old request cannot resurrect it',async()=>{cancelIntent=request('cancel_delete',{expectedRevision:pending.revision});cancelled=await run(cancelIntent);assert.equal(cancelled.status,'cancelled');assert.notEqual(cancelled.revision,pending.revision);assert.equal(cancelled.eligibleAfter,pending.eligibleAfter);assert.equal((await run(cancelIntent)).revision,cancelled.revision);await assert.rejects(run(intent),{code:'aborted'});assert.equal((await stateRef.get()).data().status,'cancelled');await assertUntouched(profileBefore)});
  await check('competing request/cancel from one revision commit only one result',async()=>{const result=await run(request('request_delete',{expectedRevision:cancelled.revision}));const race=await Promise.allSettled([run(request('cancel_delete',{expectedRevision:result.revision})),run(request('cancel_delete',{expectedRevision:result.revision}))]);assert.equal(race.filter(value=>value.status==='fulfilled').length,1);assert.equal(race.filter(value=>value.status==='rejected').length,1)});
  await check('unsupported legacy request is preserved and requires ownership review',async()=>{const current=(await stateRef.get()).data();await stateRef.set({user_id:uid,status:'pending',requested_at:'2020-01-01'});assert.equal((await run(request())).status,'review_required');const before=(await stateRef.get()).data();await assert.rejects(run(request('request_delete',{expectedRevision:null})));await assert.rejects(run(request('cancel_delete',{expectedRevision:null})));assert.deepEqual((await stateRef.get()).data(),before);await stateRef.set(current);await db.doc(`account_deletion_requests/${profileId}`).set({user_id:uid,status:'pending'});assert.equal((await run(request())).status,'review_required');await db.doc(`account_deletion_requests/${profileId}`).delete()});
  await check('old login, forged scope, malformed schema, disabled account and borrowed alias fail closed',async()=>{const current=(await stateRef.get()).data();const old=request('request_delete',{expectedRevision:current.revision});old.auth.token.auth_time=Math.floor(Date.now()/1000)-301;await assert.rejects(run(old),{code:'unauthenticated'});for(const extra of [{expectedOwnerUid:'other'},{expectedProfileId:'other'},{email:'forged@example.test'},{action:'constructor'},{expectedRevision:'bad'}])await assert.rejects(run(request('request_delete',{expectedRevision:current.revision,...extra})));await auth.updateUser(uid,{disabled:true});await assert.rejects(run(request()));await auth.updateUser(uid,{disabled:false});await auth.createUser({uid:profileId});await assert.rejects(run(request()));await auth.deleteUser(profileId);assert.deepEqual((await stateRef.get()).data(),current)});
  await check('raw state and receipts denied for owner, another account and client admin; baseline otherwise identical',async()=>{const baseline=(await readFile('releases/people-discovery-20261006/firestore.rules','utf8')).replaceAll('\r\n','\n');const old="match /account_deletion_requests/{id}     { allow create: if willOwn('user_id'); allow read, update, delete: if isAdmin(); }";assert.ok(baseline.includes(old));const candidate=(await readFile('security/account-deletion-authority-candidate.rules','utf8')).replaceAll('\r\n','\n');assert.equal(candidate,baseline.replace(old,'match /account_deletion_requests/{id} { allow read, write: if false; }\n    match /_account_deletion_receipts/{id} { allow read, write: if false; }'));
    env=await initializeTestEnvironment({projectId:process.env.GCLOUD_PROJECT,firestore:{host:'127.0.0.1',port:9494,rules:candidate}});
    const receipt=(await db.collection('_account_deletion_receipts').limit(1).get()).docs[0].id;
    for(const [actor,claims] of [[uid,{}],['deletion-other',{}],['deletion-admin',{admin:true}]]){const client=env.authenticatedContext(actor,claims).firestore();for(const path of [`account_deletion_requests/${uid}`,`_account_deletion_receipts/${receipt}`]){const target=doc(client,path);for(const operation of [()=>getDoc(target),()=>setDoc(target,{user_id:actor}),()=>updateDoc(target,{status:'cancelled'}),()=>deleteDoc(target)]){await assertFails(operation());rulesChecks++;}}}
  });
  await check('recreated real Auth cannot adopt previous incarnation request',async()=>{await auth.deleteUser(uid);await auth.createUser({uid});await assert.rejects(run(request()));await assertUntouched(profileBefore)});
  console.log(JSON.stringify({groups,rulesChecks,node:process.version,compiledEndpoint:true,project:process.env.GCLOUD_PROJECT,productionWrites:false,permanentDeletionImplemented:false,httpAdmissionCertified:false}));
}finally{await env?.cleanup();await db.terminate()}
