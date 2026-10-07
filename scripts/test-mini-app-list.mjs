import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

process.env.GCLOUD_PROJECT = 'demo-mini-app-list';
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'demo-mini-app-list' });
const { runListMiniApps, MINI_APP_LIST_PAGE_SIZE } = await import('../functions/lib/miniAppList.js');
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { Timestamp } = require('firebase-admin/firestore');
const source = { title: 'Tap rush', description: 'A tiny game', category: 'game', html: '<button>Play</button>', css: '', javascript: '' };
const stamp = Timestamp.fromMillis(1_700_000_000_000);

function fakeDb(rows, calls) {
  const docs = rows.map(row => ({ id: row.id, data: () => row.data, ref: { path: row.path } }));
  return {
    doc(path) {
      const found = docs.find(doc => doc.ref.path === path);
      return { get: async () => found ? { id: found.id, exists: true, data: found.data } : { id: path.split('/').pop(), exists: false, data: () => undefined } };
    },
    collection(name) {
      const chain = { filters: [], ordered: false, after: undefined, max: undefined };
      const api = {
        where(field, op, value) { chain.filters.push({ field, op, value }); return api; },
        orderBy(field) { chain.ordered = field; return api; },
        startAfter(id) { chain.after = id; return api; },
        limit(count) { chain.max = count; return api; },
        async get() {
          calls.push({ name, ...chain, filters: [...chain.filters] });
          let matched = docs.filter(doc => doc.ref.path.startsWith(`${name}/`));
          for (const filter of chain.filters) matched = matched.filter(doc => doc.data()[filter.field] === filter.value);
          if (chain.ordered || chain.after !== undefined) matched.sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
          if (chain.after !== undefined) matched = matched.filter(doc => doc.id > chain.after);
          if (chain.max !== undefined) matched = matched.slice(0, chain.max);
          return { docs: matched, size: matched.length };
        },
      };
      return api;
    },
  };
}

const uid = 'owner-alice';
const calls = [];
const rows = [
  { path: 'mini_apps/b-live', id: 'b-live', data: { ...source, owner_id: 'someone', schema_version: 1, status: 'published', publication_revision: 'a'.repeat(32), created_at: stamp, updated_at: stamp, private_notes: 'hidden' } },
  { path: 'mini_apps/a-draft-snapshot', id: 'a-draft-snapshot', data: { ...source, title: 'Unpublished', owner_id: uid, schema_version: 1, status: 'draft' } },
  { path: 'mini_app_drafts/m-own', id: 'm-own', data: { ...source, title: 'Mine', owner_id: uid, schema_version: 1, created_at: stamp, updated_at: stamp } },
  { path: 'mini_app_drafts/z-other', id: 'z-other', data: { ...source, title: 'Secret', owner_id: 'bob', schema_version: 1 } },
];
for (let i = 0; i < 30; i++) rows.push({ path: `mini_app_drafts/d-${String(i).padStart(2, '0')}`, id: `d-${String(i).padStart(2, '0')}`, data: { ...source, title: `Draft ${i}`, owner_id: uid, schema_version: 1 } });
const database = fakeDb(rows, calls);
const published = await runListMiniApps(database, uid, { expectedOwnerUid: uid, view: 'published', cursor: null });
assert.deepEqual(published.apps.map(app => app.id), ['b-live']);
assert.equal(published.apps[0].private_notes, undefined);
assert.equal(published.nextCursor, null);
assert.ok(calls.at(-1).ordered);
assert.equal(calls.at(-1).filters.length, 0);
const drafts = await runListMiniApps(database, uid, { expectedOwnerUid: uid, view: 'drafts' });
assert.equal(drafts.apps.length, MINI_APP_LIST_PAGE_SIZE);
assert.equal(drafts.apps[0].id, 'd-00');
assert.equal(drafts.apps.some(app => app.owner_id !== uid), false);
assert.equal(drafts.nextCursor, drafts.apps.at(-1).id);
assert.equal(calls.at(-1).ordered, false);
assert.deepEqual(calls.at(-1).filters, [{ field: 'owner_id', op: '==', value: uid }]);
const next = await runListMiniApps(database, uid, { expectedOwnerUid: uid, view: 'drafts', cursor: drafts.nextCursor });
assert.equal(next.apps[0].id > drafts.nextCursor, true);
assert.equal(new Set([...drafts.apps, ...next.apps].map(app => app.id)).size, drafts.apps.length + next.apps.length);
const one = await runListMiniApps(database, uid, { expectedOwnerUid: uid, view: 'published', appId: 'b-live' });
assert.equal(one.apps[0].title, source.title);
const missing = await runListMiniApps(database, uid, { expectedOwnerUid: uid, view: 'published', appId: 'missing' });
assert.deepEqual(missing, { apps: [], nextCursor: null });
await assert.rejects(runListMiniApps(database, uid, { expectedOwnerUid: 'other', view: 'published' }), error => error.code === 'failed-precondition');
await assert.rejects(runListMiniApps(database, uid, { expectedOwnerUid: uid, view: 'drafts', appId: 'm-own' }), error => error.code === 'invalid-argument');
console.log('PASS mini-app list authority');
