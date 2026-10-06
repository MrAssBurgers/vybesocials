import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
assert.equal(process.env.GCLOUD_PROJECT,'demo-vybe-parental-qa');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:9494');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST,'127.0.0.1:9497');
process.env.FIREBASE_CONFIG=JSON.stringify({projectId:process.env.GCLOUD_PROJECT});
const {db,auth}=await import('../functions/lib/_shared/admin.js');
assert.equal(db.projectId,'demo-vybe-parental-qa');assert.equal(auth.app.options.projectId,'demo-vybe-parental-qa');
const api=await import('../functions/lib/auth.js');
const {accountExportSections}=await import('../functions/lib/_shared/accountExportAuthority.js');
const uid='account-export-qa-owner',profileId='account-export-qa-profile';let created,groups=0;
const request=(section='profile',after=null,extra={})=>({auth:{uid,token:{auth_time:Math.floor(Date.now()/1000)}},data:{action:'export',requestId:'00000000-0000-4000-8000-000000000001',section,after,expectedOwnerUid:uid,expectedProfileId:profileId,expectedAccountCreatedAt:created,...extra}});
const run=(section='profile',after=null,extra={})=>api.manageAccount.run(request(section,after,extra));
const check=async(name,fn)=>{await fn();groups++;console.log('PASS '+name)};
const snapshot=async()=>Promise.all((await db.listCollections()).sort((a,b)=>a.id.localeCompare(b.id)).map(async c=>[c.id,(await c.get()).docs.map(d=>[d.id,d.data()])]));
try{
  for(const ownId of [uid,profileId]){try{await auth.deleteUser(ownId)}catch(e){if(e.code!=='auth/user-not-found')throw e}}
  await auth.createUser({uid});created=Date.parse((await auth.getUser(uid)).metadata.creationTime);
  // Clear only this dedicated synthetic QA project's Firestore database.
  const response=await fetch('http://127.0.0.1:9494/emulator/v1/projects/demo-vybe-parental-qa/databases/(default)/documents',{method:'DELETE'});assert.equal(response.ok,true);
  await db.doc(`profiles/${profileId}`).set({user_id:uid,username:'export-qa',private_staff_note:'never-export'});
  await db.doc(`_account_profile_bindings/${uid}`).set({version:1,status:'active',owner_uid:uid,profile_id:profileId,auth_created_at_ms:created,revision:'a'.repeat(48)});
  const batch=db.batch();for(let i=0;i<57;i++)batch.set(db.doc(`posts/p${String(i).padStart(3,'0')}`),{author_id:profileId,caption:String(i),created_at:new Date().toISOString(),pin_hash:'never-export'});
  batch.set(db.doc('posts/peer'),{author_id:'other-profile',caption:'peer'});batch.set(db.doc('messages/own'),{sender_id:profileId,content:'own synthetic',conversation_id:'c'});batch.set(db.doc('messages/peer'),{sender_id:'other-profile',recipient_id:profileId,content:'peer private'});await batch.commit();
  await check('verified old endpoint returns only profile despite the advertised content export',async()=>{
    const source=execFileSync('git',['show','bf7421bf23ef2857d16ac3050e1fa13dc575ef19:functions/src/auth.ts'],{encoding:'utf8'});const start=source.indexOf('export const manageAccount = onCall(');const end=source.indexOf('/** Staff-only Firebase Auth user count',start);
    assert.ok(start>0&&end>start);const body=source.slice(start,end).replace('const raw = (request.data || {}) as { action?: string };','const raw = (request.data || {});');
    assert.ok(body.includes('Lightweight export stub'));
    await writeFile('work/account-export-baseline.mjs',`import {onCall,HttpsError} from '../functions/node_modules/firebase-functions/lib/v2/providers/https.js';import {db,requireAuth} from '../functions/lib/_shared/admin.js';\n${body}`);
    const old=await import('../work/account-export-baseline.mjs');const result=await old.manageAccount.run(request());assert.equal(result.ok,true);assert.equal(result.profile.user_id,uid);assert.equal(result.version,undefined);assert.equal(result.sections,undefined);assert.equal(result.records,undefined);
  });
  await check('compiled endpoint exports every page with canonical owner acknowledgements',async()=>{const first=await run('posts');const second=await run('posts',first.nextAfter);assert.equal(first.records.length,50);assert.equal(second.records.length,7);assert.equal(second.nextAfter,null);assert.equal(first.records[0].pin_hash,undefined);assert.equal(first.ownerUid,uid);assert.equal(first.profileId,profileId)});
  await check('all manifest sections read without writes or peer message bodies',async()=>{const before=await snapshot();for(const section of Object.keys(accountExportSections))await run(section);assert.deepEqual(await snapshot(),before);assert.deepEqual((await run('messages')).records,[{id:'own',sender_id:profileId,conversation_id:'c',content:'own synthetic'}]);assert.equal((await run()).records[0].private_staff_note,undefined)});
  await check('forged collection and changed profile or UID fail closed',async()=>{for(const extra of [{section:'_auth_email_challenges'},{expectedOwnerUid:'other'},{expectedProfileId:'other-profile'}])await assert.rejects(run('profile',null,extra))});
  await check('removed and expired content remains unavailable',async()=>{await db.doc('messages/own').update({expires_at:'2020-01-01'});const result=await run('messages');assert.equal(result.records[0].content,undefined);assert.equal(result.records[0].content_unavailable,true)});
  await check('real byte-bounded pages continue without record truncation',async()=>{const batch=db.batch();for(let i=0;i<4;i++)batch.set(db.doc(`comments/large${i}`),{user_id:profileId,content:'x'.repeat(800000)});await batch.commit();const first=await run('comments');assert.equal(first.records.length,2);assert.equal(first.records[0].content.length,800000);const second=await run('comments',first.nextAfter);assert.equal(second.records.length,2);assert.equal(second.nextAfter,null)});
  await check('retired binding and active profile-ID Auth account deny',async()=>{await db.doc(`_account_profile_bindings/${uid}`).update({status:'retired'});await assert.rejects(run());await db.doc(`_account_profile_bindings/${uid}`).update({status:'active'});await auth.createUser({uid:profileId});await assert.rejects(run());await auth.deleteUser(profileId)});
  await check('disabled or recreated real Auth owner cannot reuse export intent',async()=>{await auth.updateUser(uid,{disabled:true});await assert.rejects(run());await auth.updateUser(uid,{disabled:false});await auth.deleteUser(uid);await auth.createUser({uid});await assert.rejects(run())});
  console.log(JSON.stringify({groups,project:'demo-vybe-parental-qa',compiledEndpoint:true,productionWrites:false,httpAdmissionCertified:false}));
}finally{await db.terminate()}
