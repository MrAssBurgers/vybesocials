import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
const projectId=process.env.GCLOUD_PROJECT, endpoint=process.env.FIRESTORE_EMULATOR_HOST;
assert.match(projectId||'',/^demo-[a-z0-9-]+$/);assert.match(endpoint||'',/^(127\.0\.0\.1|localhost):\d+$/);
const require=createRequire(path.resolve(process.env.FIREBASE_TEST_TOOLS_ROOT,'package.json'));
const{initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const{doc,setDoc,getDoc,getDocs,collection,updateDoc,deleteDoc,deleteField,setLogLevel}=require('firebase/firestore');setLogLevel('silent');
const[host,port]=endpoint.split(':');
const env=await initializeTestEnvironment({projectId,firestore:{host,port:Number(port),rules:await readFile(process.env.FIRESTORE_RULES_FILE||'security/marketplace-candidate-20261114.rules','utf8')}});
const alice=env.authenticatedContext('token-alice').firestore(),bob=env.authenticatedContext('token-bob').firestore(),staff=env.authenticatedContext('token-staff',{admin:true}).firestore(),guest=env.unauthenticatedContext().firestore();
const seed=(table,id,value)=>env.withSecurityRulesDisabled(context=>setDoc(doc(context.firestore(),table,id),value));
let checks=0;
const yes=async(label,run)=>{await assertSucceeds(run());checks++;console.log('PASS '+label);};
const no=async(label,run)=>{await assertFails(run());checks++;console.log('PASS '+label);};
try{
 await env.clearFirestore();
 const equipped=Object.fromEntries(['title','effect','frame','name_color','profile_theme','badge_id'].map(key=>['equipped_'+key,'verified-'+key]));
 await seed('profiles','legacy-alice',{user_id:'token-alice',...equipped,bio:'Hello'});await seed('profiles','token-bob',{user_id:'token-bob'});await seed('user_auth_index','token-alice',{profile_id:'legacy-alice'});
 for(const table of['token_wallets','token_entitlements','token_boosts','token_events','_token_purchase_requests','_token_credit_receipts','_token_credit_day_limits','_verified_xp_authority','_badge_grant_authority','_challenge_reward_authority']){
  await seed(table,'token-alice',{user_id:'token-alice',schema_version:1,balance:10,active:true});
  for(const[label,client]of[['owner',alice],['outsider',bob],['staff',staff],['guest',guest]]){
   await no(`${label} get ${table}`,()=>getDoc(doc(client,table,'token-alice')));
   await no(`${label} list ${table}`,()=>getDocs(collection(client,table)));
   await no(`${label} create ${table}`,()=>setDoc(doc(client,table,'forged'),{user_id:'token-alice',balance:999999}));
   await no(`${label} update ${table}`,()=>updateDoc(doc(client,table,'token-alice'),{balance:999999}));
   await no(`${label} delete ${table}`,()=>deleteDoc(doc(client,table,'token-alice')));
  }
 }
 for(const table of['vybe_tokens','token_transactions','marketplace_purchases','user_active_boosts']){
  await seed(table,'legacy',{user_id:'legacy-alice',balance:10,consumed:true});
  await yes('owner retains '+table+' history',()=>getDoc(doc(alice,table,'legacy')));
  for(const[label,client]of[['owner',alice],['outsider',bob],['staff',staff]]){
   await no(`${label} create legacy ${table}`,()=>setDoc(doc(client,table,'forged'),{user_id:'token-alice',balance:999999}));
   await no(`${label} reset legacy ${table}`,()=>updateDoc(doc(client,table,'legacy'),{balance:999999,consumed:false}));
   await no(`${label} delete legacy ${table}`,()=>deleteDoc(doc(client,table,'legacy')));
  }
 }
 for(const field of Object.keys(equipped))for(const[label,client]of[['owner',alice],['staff',staff]]){
  await no(`${label} self-equip ${field}`,()=>updateDoc(doc(client,'profiles','legacy-alice'),{[field]:'forged'}));
  await no(`${label} erase ${field}`,()=>updateDoc(doc(client,'profiles','legacy-alice'),{[field]:deleteField()}));
 }
 await yes('ordinary profile edits retain equipment',()=>updateDoc(doc(alice,'profiles','legacy-alice'),{display_name:'Alice',bio:'New'}));
 await yes('free appearance settings remain editable',()=>setDoc(doc(alice,'profiles','legacy-alice','settings','appearance'),{accent:'purple'}));
 await no('profile replacement cannot strip equipment',()=>setDoc(doc(alice,'profiles','legacy-alice'),{user_id:'token-alice'}));
 console.log(`PASS ${checks} exact-candidate marketplace Rules SDK checks; unrelated post/comment publication protocols are outside this Rules slice`);
}finally{await env.cleanup();}
