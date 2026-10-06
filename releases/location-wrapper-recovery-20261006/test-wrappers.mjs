import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
assert.equal(process.env.GCLOUD_PROJECT,'demo-vybe-contacts-qa');assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8387');process.env.FIREBASE_CONFIG=JSON.stringify({projectId:process.env.GCLOUD_PROJECT});
const {db}=await import('../../functions/lib/_shared/admin.js');
const {createLocationRequest,respondLocationRequest,pauseLocationShare,stopLocationShare}=await import('../../functions/lib/locationSharing.js');
const suffix=randomUUID(),a={uid:'wrapper-a-'+suffix,profileId:'wrapper-a-profile-'+suffix},b={uid:'wrapper-b-'+suffix,profileId:'wrapper-b-profile-'+suffix};
const call=(fn,actor,data)=>fn.run({auth:{uid:actor.uid},data:{expectedOwnerUid:actor.uid,expectedProfileId:actor.profileId,requestId:randomUUID(),...data}});
try{
 for(const actor of [a,b]){await db.doc('profiles/'+actor.profileId).set({user_id:actor.uid,username:actor.uid,is_private:false});await db.doc('user_auth_index/'+actor.uid).set({profile_id:actor.profileId});}
 await db.doc('friend_requests/wrapper-'+suffix).set({sender_id:a.profileId,receiver_id:b.profileId,status:'accepted'});
 for(const fn of [createLocationRequest,respondLocationRequest,pauseLocationShare,stopLocationShare]){await assert.rejects(fn.run({data:{}}),{code:'unauthenticated'});await assert.rejects(fn.run({auth:{uid:a.uid},data:{target_id:b.profileId}}),{code:'failed-precondition'});}
 const requested=await call(createLocationRequest,a,{targetId:b.profileId,duration:'1h',precision:'approximate',message:null});assert.equal(requested.request.status,'pending');
 await assert.rejects(call(respondLocationRequest,a,{locationRequestId:requested.request.id,expectedRevision:requested.request.revision,intent:'accept'}),{code:'permission-denied'});
 const accepted=await call(respondLocationRequest,b,{locationRequestId:requested.request.id,expectedRevision:requested.request.revision,intent:'accept'});assert.equal(accepted.share.sharerId,b.profileId);assert.equal(accepted.share.viewerId,a.profileId);
 const paused=await call(pauseLocationShare,b,{shareId:accepted.share.id,expectedRevision:accepted.share.revision,paused:true});assert.equal(paused.share.paused,true);
 await assert.rejects(call(stopLocationShare,b,{shareId:accepted.share.id,expectedRevision:accepted.share.revision}),{code:'aborted'});
 const stopped=await call(stopLocationShare,b,{shareId:paused.share.id,expectedRevision:paused.share.revision});assert.equal(stopped.share.active,false);
 console.log('PASS four exact callable wrappers: guest/legacy denial, checked request, directional acceptance, pause, stale revision denial and stop');
}finally{await db.terminate();}
