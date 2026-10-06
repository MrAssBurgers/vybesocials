import assert from 'node:assert/strict';import{randomUUID}from'node:crypto';import{createRequire}from'node:module';
const projectId=process.env.GCLOUD_PROJECT;assert.equal(projectId,'demo-vybe-space-authority');assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8387');assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST,'127.0.0.1:9297');process.env.FIREBASE_CONFIG=JSON.stringify({projectId});
const require=createRequire(new URL('../functions/package.json',import.meta.url));const{db}=await import('../functions/lib/_shared/admin.js');const{getAuth}=require('firebase-admin/auth');const auth=getAuth();const{manageSpaceAuthority:run,spaceMemberId}=await import('../functions/lib/_shared/spaceAuthority.js');
const prefix=randomUUID(),users=[];
for(let offset=0;offset<200;offset+=20)users.push(...await Promise.all(Array.from({length:20},(_,i)=>auth.createUser({uid:`${prefix}-${offset+i}`}))));
const entries=[];for(const user of users){const profileId=user.uid+'-profile';entries.push([`profiles/${profileId}`,{user_id:user.uid,username:'Synthetic participant'}],[`user_auth_index/${user.uid}`,{profile_id:profileId}],[`_account_profile_bindings/${user.uid}`,{version:1,status:'active',owner_uid:user.uid,profile_id:profileId,auth_created_at_ms:Date.parse(user.metadata.creationTime),revision:'a'.repeat(48)}]);}
for(let offset=0;offset<entries.length;offset+=400){const batch=db.batch();for(const[p,v]of entries.slice(offset,offset+400))batch.set(db.doc(p),v);await batch.commit();}
const host=users[0],body={expectedOwnerUid:host.uid,expectedProfileId:host.uid+'-profile'};
const created=await run(db,auth,host.uid,{...body,action:'create',requestId:randomUUID(),title:'Isolated capacity measurement'}),spaceId=created.space.id;
const batch=db.batch();for(const user of users.slice(1)){const row={...(await db.doc(`_space_members/${created.participant.id}`).get()).data(),id:spaceMemberId(spaceId,user.uid),owner_uid:user.uid,profile_id:user.uid+'-profile',auth_created_at_ms:Date.parse(user.metadata.creationTime),profile:{id:user.uid+'-profile',username:'Synthetic participant'},role:'listener'};batch.set(db.doc(`_space_members/${row.id}`),row);}
batch.update(db.doc(`_space_authority/${spaceId}`),{participant_count:200,listener_count:199,peak_listeners:199});await batch.commit();
let singles=0,batches=0;const checked={getUser:async uid=>{singles++;return auth.getUser(uid)},getUsers:async ids=>{batches++;return auth.getUsers(ids)}};
const start=performance.now();const result=await run(db,checked,host.uid,{...body,action:'read',spaceId});assert.equal(result.participants.length,200);
assert.equal(singles,1);assert.equal(batches,2);
console.log(JSON.stringify({projectId,participants:result.participants.length,individualAuthRequests:singles,batchAuthRequests:batches,elapsedMs:Math.round(performance.now()-start),productionWrites:false,scope:'Isolated full-capacity read; emulator latency is not production latency'}));
await db.terminate();
