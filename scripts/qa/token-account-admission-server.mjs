import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createRequire } from 'node:module';
import path from 'node:path';
assert.equal(process.versions.node.split('.')[0], '22');
assert.equal(process.env.GCLOUD_PROJECT, 'demo-vybe-token-admission');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8387');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9200');
const require = createRequire(path.resolve('functions/package.json')), express = require('express');
const { HttpsError } = require('firebase-functions/v2/https');
const { db, auth } = await import('../../functions/lib/_shared/admin.js');
const context = new AsyncLocalStorage(), realFetch = globalThis.fetch, transaction = db.runTransaction.bind(db);
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url), scope = context.getStore();
  if (scope && url.href === 'http://127.0.0.1:9200/identitytoolkit.googleapis.com/v1/projects/demo-vybe-token-admission/accounts:lookup') {
    scope.lookups++;
    if (scope.lookups === 3) {
      if (scope.scenario === 'disable-before-commit') await auth.updateUser(scope.uid, { disabled: true });
      if (scope.scenario === 'replace-before-commit') {
        await auth.deleteUser(scope.uid);
        const imported = await auth.importUsers([{ uid: scope.uid, metadata: { creationTime: new Date(scope.createdAtMs + 1).toISOString() } }]);
        assert.equal(imported.failureCount, 0);
      }
    }
    const response = await realFetch(input, init);
    if (scope.lookups === 1 && response.ok) scope.createdAtMs = Number((await response.clone().json()).users?.[0]?.createdAt);
    return response;
  }
  return realFetch(input, init);
};
db.runTransaction = async (run, ...args) => {
  const scope = context.getStore(); if (scope) scope.transactions++;
  if (scope?.scenario === 'fail-commit' && scope.transactions === 2) return transaction(async tx => { await run(tx); throw new HttpsError('unavailable', 'Synthetic commit failure'); }, ...args);
  return transaction(run, ...args);
};
const { tokenMarketplace } = await import('../../functions/lib/tokenMarketplace.js');
const app = express(); app.use(express.json());
app.post('/tokenMarketplace', (req, res) => {
  const uid = req.headers['x-qa-uid'];
  if (uid !== undefined) assert.match(uid, /^token-admission-[0-9a-f-]{36}$/);
  const scope = { uid, scenario: req.headers['x-qa-scenario'], lookups: 0, transactions: 0, createdAtMs: 0 };
  const json = res.json.bind(res); res.json = body => { res.setHeader('x-qa-lookups', scope.lookups); return json(body); };
  return context.run(scope, () => tokenMarketplace(req, res));
});
app.listen(8358, '127.0.0.1', () => console.log('Actual tokenMarketplace callable8358; exclusive demo Firebase Auth/Firestore; no production access'));
