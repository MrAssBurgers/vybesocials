import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createRequire } from 'node:module';
import path from 'node:path';
assert.equal(process.versions.node.split('.')[0], '22');
assert.equal(process.env.GCLOUD_PROJECT, 'demo-vybe-roulette-qa');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8390');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9298');
const require = createRequire(path.resolve('functions/package.json')), express = require('express');
const { HttpsError } = require('firebase-functions/v2/https');
const { db, auth } = await import('../../functions/lib/_shared/admin.js');
const scope = new AsyncLocalStorage(), holds = new Map(), realNow = Date.now, realFetch = globalThis.fetch, transaction = db.runTransaction.bind(db);
const owned = uid => typeof uid === 'string' && /^roulette-qa-[a-f0-9-]{36}-[a-z]+$/.test(uid);
Date.now = () => realNow() + (scope.getStore()?.shift || 0);
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url), current = scope.getStore();
  if (current && url.href === 'http://127.0.0.1:9298/identitytoolkit.googleapis.com/v1/projects/demo-vybe-roulette-qa/accounts:lookup') {
    const uid = JSON.parse(init.body).localId[0];
    if (uid === current.uid) {
      current.lookups++;
      if (current.lookups === 2) {
        if (current.scenario === 'disable-before-commit') await auth.updateUser(uid, { disabled: true });
        if (current.scenario === 'replace-before-commit') {
          await auth.deleteUser(uid);
          const result = await auth.importUsers([{ uid, metadata: { creationTime: new Date(current.createdAtMs + 1).toISOString() } }]);
          assert.equal(result.failureCount, 0);
        }
      }
    }
    const response = await realFetch(input, init);
    if (uid === current.uid && current.lookups === 1 && response.ok) current.createdAtMs = Number((await response.clone().json()).users?.[0]?.createdAt);
    return response;
  }
  return realFetch(input, init);
};
db.runTransaction = async (run, ...args) => {
  const current = scope.getStore(); if (current) current.transactions++;
  if (current?.transactions === 2 && current.scenario === 'hold-before-domain') await new Promise(resolve => holds.set(current.uid, resolve));
  if (current?.transactions === 2 && current.scenario === 'retire-binding-before-domain') await db.doc('_account_profile_bindings/' + current.uid).update({ status: 'retired' });
  if (current?.transactions === 2 && current.scenario === 'fail-domain-commit') return transaction(async tx => { await run(tx); throw new HttpsError('unavailable', 'Synthetic domain commit failure'); }, ...args);
  return transaction(run, ...args);
};
const { findRouletteMatch } = await import('../../functions/lib/roulette.js');
const app = express(); app.use(express.json());
app.all(['/findRouletteMatch', '/demo-vybe-roulette-qa/us-central1/findRouletteMatch'], (request, response) => {
  const uid = request.headers['x-qa-uid']; if (uid !== undefined) assert.ok(owned(uid));
  const shift = Number(request.headers['x-qa-clock-ahead'] || 0); assert.ok([0, 31000, 61000, 121000].includes(shift));
  const current = { uid, scenario: request.headers['x-qa-scenario'], shift, lookups: 0, transactions: 0 };
  return scope.run(current, () => findRouletteMatch(request, response));
});
app.get('/qa/holds', (_request, response) => response.json({ users: [...holds.keys()] }));
app.post('/qa/release', (request, response) => { assert.ok(owned(request.body.uid)); const release = holds.get(request.body.uid); holds.delete(request.body.uid); release?.(); response.json({ released: !!release }); });
app.listen(8359, '127.0.0.1', () => console.log('Actual findRouletteMatch8359; exclusive demo Auth9298/Firestore8390; no production access'));
