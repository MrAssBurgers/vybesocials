import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
assert.equal(process.versions.node.split('.')[0], '22');
assert.equal(process.env.GCLOUD_PROJECT, 'demo-vybe-login-completion');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8387');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9200');
const root = path.resolve('work/login-email-completion-release/functions');
const require = createRequire(root + '/package.json'), express = require('express');
const { HttpsError } = require('firebase-functions/v2/https');
const load = file => import(pathToFileURL(root + '/' + file).href);
const { db, auth } = await load('lib/_shared/admin.js');
const context = new AsyncLocalStorage();
const realTransaction = db.runTransaction.bind(db), realGetUser = auth.getUser.bind(auth);
auth.getUser = async (...args) => { const scope = context.getStore(); if (scope) scope.authReads++; return realGetUser(...args); };
db.runTransaction = async (run, ...args) => {
  const scope = context.getStore();
  if (scope) {
    scope.transactions++;
    await new Promise(done => setTimeout(done, 120));
    if (scope.transactions === 2) {
      if (scope.scenario === 'retire-binding') await db.doc('_account_profile_bindings/' + scope.uid).update({ status: 'retired' });
      if (scope.scenario === 'disable-account') await auth.updateUser(scope.uid, { disabled: true });
      if (scope.scenario === 'invalidate-proof') await db.doc('_auth_email_challenges/' + scope.challenge).update({ status: 'retired' });
      if (scope.scenario === 'revoke-device') for (const doc of (await db.collection('user_sessions').where('user_id', '==', scope.uid).get()).docs) await doc.ref.update({ revoked_at: new Date(Date.now() + 1000).toISOString() });
      if (scope.scenario === 'fail-commit') return realTransaction(async tx => { await run(tx); throw new HttpsError('unavailable', 'Synthetic commit failure'); }, ...args);
    }
  }
  return realTransaction(run, ...args);
};
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname === 'ipapi.co') return Promise.resolve(new Response(JSON.stringify({ city: 'Synthetic city', country: 'US', latitude: 12, longitude: 24 }), { headers: { 'Content-Type': 'application/json' } }));
  return realFetch(input, init);
};
const candidate = await load('index.js'), baseline = await load('lib/auth-baseline.js');
assert.deepEqual(Object.keys(candidate), ['authLoginNotify']);
const app = express(); app.use(express.json());
for (const [name, handler] of [['candidate', candidate.authLoginNotify], ['baseline', baseline.authLoginNotify]]) app.post('/' + name, (req, res) => {
  const scope = { uid: req.body.data?.expectedOwnerUid, challenge: req.body.data?.expectedEmailChallengeId, scenario: req.headers['x-qa-scenario'], transactions: 0, authReads: 0 };
  const json = res.json.bind(res); res.json = body => { res.setHeader('x-qa-transactions', scope.transactions); res.setHeader('x-qa-auth-reads', scope.authReads); return json(body); };
  return context.run(scope, () => handler(req, res));
});
app.listen(8358, '127.0.0.1', () => console.log('Baseline/candidate callables8358; owned demo Auth/Firestore only; synthetic geo and120ms transaction delay'));
