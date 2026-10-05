import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8387');
const require=createRequire(path.resolve(process.env.FIREBASE_TEST_TOOLS_ROOT,'package.json'));
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,deleteDoc,setLogLevel}=require('firebase/firestore');setLogLevel('silent');
const baseline=await readFile('releases/profile-bootstrap-20261005/firestore.rules','utf8');
const candidate=await readFile('releases/sign-in-20261005/firestore.rules','utf8');
let count=0;
for(const [name,rules] of [['baseline',baseline],['candidate',candidate]]){
 const env=await initializeTestEnvironment({projectId:`demo-sign-in-${name}`,firestore:{host:'127.0.0.1',port:8387,rules}});
 try{
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx=>{
   const db=ctx.firestore();
   await setDoc(doc(db,'profiles','alice'),{user_id:'alice'});
   await setDoc(doc(db,'user_2fa_settings','alice'),{email_2fa_enabled:true});
   for(const collection of ['_auth_email_challenges','_auth_email_limits','_auth_device_session_heads'])await setDoc(doc(db,collection,'proof'),{owner_uid:'alice',private:'secret'});
   await setDoc(doc(db,'auth_challenges','fresh-email'),{user_id:'alice',challenge_type:'email_2fa',status:'pending',channel:'email',metadata:{code_channel:'email',switched_to:'email_code'}});
  });
  const own=env.authenticatedContext('alice').firestore();
  await assertSucceeds(getDoc(doc(own,'user_2fa_settings','alice')));count++;
  for(const ctx of [env.authenticatedContext('alice'),env.authenticatedContext('bob'),env.authenticatedContext('staff',{admin:true}),env.unauthenticatedContext()]){
   for(const collection of ['_auth_email_challenges','_auth_email_limits','_auth_device_session_heads']){
    const ref=doc(ctx.firestore(),collection,'proof');
    await assertFails(getDoc(ref));await assertFails(setDoc(ref,{owner_uid:'alice'}));await assertFails(deleteDoc(ref));count+=3;
   }
  }
  if(name==='baseline'){
   const publicStatus=await assertSucceeds(getDoc(doc(own,'auth_challenges','fresh-email')));
   assert.deepEqual(Object.keys(publicStatus.data()).sort(),['challenge_type','channel','metadata','status','user_id']);count++;
  }else{
   await assertFails(getDoc(doc(own,'auth_challenges','fresh-email')));
   await assertFails(setDoc(doc(own,'user_2fa_settings','alice'),{email_2fa_enabled:false}));count+=2;
  }
  console.log(`PASS ${name}: private authority denied, own settings readable; fresh public status contains no code, hash, email or token`);
 }finally{await env.cleanup();}
}
console.log(`PASS ${count} exact live baseline/candidate sign-in checks`);
