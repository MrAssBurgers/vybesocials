import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
assert.equal(process.env.GCLOUD_PROJECT,'demo-vybe-code-recovery');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8387');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST,'127.0.0.1:9200');
const root=path.resolve('work/login-code-followup');
const require=createRequire(path.join(root,'minimal-verify/package.json'));
const express=require('express');
const candidate=await import(pathToFileURL(path.join(root,'minimal-verify/index.js')));
const baseline=await import(pathToFileURL(path.join(root,'baseline-verify/lib/auth.js')));
const app=express(); app.use(express.json());
for(const [route,handler] of [['/baseline',baseline.auth2faVerify],['/demo-vybe-code-recovery/us-central1/auth2faVerify',candidate.auth2faVerify]]) app.post(route,(req,res)=>{
 if(req.headers['x-qa-drop-reply']==='once') {const json=res.json.bind(res);res.json=body=>{if(body.result?.customToken){req.socket.destroy();return res;}return json(body);};}
 return handler(req,res);
});
app.listen(8358,'127.0.0.1',()=>console.log('Owned verification recovery baseline/candidate8358; demo Auth/Firestore only'));
