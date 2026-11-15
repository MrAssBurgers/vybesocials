import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
assert.equal(process.versions.node.split('.')[0], '22');
assert.equal(process.env.GCLOUD_PROJECT, 'demo-vybe-roulette-qa');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8390');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9298');
const { initializeApp: adminApp, deleteApp: deleteAdmin } = await import('firebase-admin/app');
const { getAuth: adminAuth } = await import('firebase-admin/auth');
const { getFirestore: adminFirestore } = await import('firebase-admin/firestore');
const { initializeApp, deleteApp } = await import('firebase/app');
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword } = await import('firebase/auth');
const { getFirestore, connectFirestoreEmulator, doc, getDocFromServer } = await import('firebase/firestore');
const project = 'demo-vybe-roulette-qa', run = randomUUID(), prefix = 'roulette-qa-' + run, endpoint = 'http://127.0.0.1:8359', users = [], paths = new Set(), apps = [], checks = [];
const admin = adminApp({ projectId: project }, prefix), db = adminFirestore(admin), auth = adminAuth(admin);
const seed = async (path, row) => { paths.add(path); await db.doc(path).set(row); };
async function player(name) {
  const uid = prefix + '-' + name, profileId = 'profile-' + uid, email = uid + '@example.test', password = 'Synthetic-roulette-QA-2026!';
  const user = await auth.createUser({ uid, email, password });
  const actor = { uid, profileId, created: Date.parse(user.metadata.creationTime), revision: randomBytes(24).toString('hex') }; users.push(actor);
  await seed('profiles/' + profileId, { id: profileId, user_id: uid, username: name, display_name: name, avatar_url: null, is_deleted: false });
  await seed('user_auth_index/' + uid, { profile_id: profileId });
  await seed('_account_profile_bindings/' + uid, { version: 1, owner_uid: uid, profile_id: profileId, auth_created_at_ms: actor.created, revision: actor.revision, status: 'active' });
  const app = initializeApp({ apiKey: 'demo-only', projectId: project, appId: 'demo-roulette' }, uid); apps.push(app);
  actor.auth = getAuth(app); connectAuthEmulator(actor.auth, 'http://127.0.0.1:9298', { disableWarnings: true }); await signInWithEmailAndPassword(actor.auth, email, password);
  actor.token = await actor.auth.currentUser.getIdToken(); actor.firestore = getFirestore(app); connectFirestoreEmulator(actor.firestore, '127.0.0.1', 8390); return actor;
}
const request = (actor, action, requestId, extra = {}) => ({ action, expectedOwnerUid: actor.uid, expectedProfileId: actor.profileId, requestId, ...extra });
async function call(actor, payload, options = {}) {
  const response = await fetch(endpoint + '/findRouletteMatch', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(actor ? { Authorization: 'Bearer ' + actor.token, 'x-qa-uid': actor.uid } : {}), ...(options.scenario ? { 'x-qa-scenario': options.scenario } : {}), ...(options.shift ? { 'x-qa-clock-ahead': String(options.shift) } : {}) }, body: JSON.stringify({ data: payload }), signal: AbortSignal.timeout(40000) });
  const body = await response.json();
  if (options.error) { assert.equal(body.error?.status, options.error, 'Expected ' + options.error + ', got ' + JSON.stringify(body)); return body.error; }
  assert.equal(response.status, 200, JSON.stringify(body)); assert.equal(body.result?.ok, true); assert.equal(body.result.ownerUid, actor.uid); assert.equal(body.result.profileId, actor.profileId); assert.equal(body.result.requestId, payload.requestId); return body.result;
}
const join = (actor, nonce, selectedMode = 'text', vibes = ['Music', 'Gaming'], options = {}) => call(actor, request(actor, 'join', nonce, { mode: selectedMode, interests: vibes }), options);
const poll = (actor, nonce, options) => call(actor, request(actor, 'poll', nonce), options);
const cancel = (actor, nonce, options) => call(actor, request(actor, 'cancel', nonce), options);
const end = (actor, nonce, matchId) => call(actor, request(actor, 'end', nonce, { matchId }));
const handoff = (actor, nonce, matchId) => call(actor, request(actor, 'handoff', nonce, { matchId }));
const check = label => { checks.push(label); console.log('PASS ' + label); };
async function ownedQueue(actor) { const rows = await Promise.all(['text', 'audio', 'video'].map(mode => db.collection('_roulette_waiting_' + mode).where('uid', '==', actor.uid).get())); return rows.flatMap(row => row.docs); }
async function operation(actor, nonce) { const result = await db.collectionGroup('operations').where('uid', '==', actor.uid).get(); const doc = result.docs.find(doc => doc.id === nonce); assert.ok(doc, 'Operation fixture missing'); return doc; }
async function quiet(actor, nonce) { const reply = await cancel(actor, nonce); assert.ok(['idle', 'ended'].includes(reply.state)); }
try {
  const preflight = await fetch(endpoint + '/findRouletteMatch', { method: 'OPTIONS', headers: { Origin: 'http://127.0.0.1:8082', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,authorization' } });
  assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://127.0.0.1:8082');
  await call(null, {}, { error: 'UNAUTHENTICATED' }); check('actual callable browser preflight and guest rejection');
  const [alice, bob, carol, dave, frank, nadia] = await Promise.all(['alice', 'bob', 'carol', 'dave', 'frank', 'nadia'].map(player));
  const a = randomUUID(), b = randomUUID();
  await call(alice, request(alice, 'join', a, { mode: 'text', interests: ['Music'], peerUid: bob.uid }), { error: 'INVALID_ARGUMENT' });
  await call(alice, { ...request(alice, 'join', a, { mode: 'text', interests: [] }), expectedProfileId: bob.profileId }, { error: 'FAILED_PRECONDITION' });
  await call(alice, request(alice, 'join', a, { mode: 'unknown', interests: [] }), { error: 'INVALID_ARGUMENT' });
  await call(alice, request(alice, 'join', a, { mode: 'text', interests: ['Music', 'Music'] }), { error: 'INVALID_ARGUMENT' }); check('caller cannot choose another owner, arbitrary peer, invalid mode or malformed interests');
  assert.equal((await join(alice, a)).state, 'searching'); const audio = randomUUID(); assert.equal((await join(bob, audio, 'audio')).state, 'searching');
  assert.equal((await poll(alice, a)).state, 'searching'); await quiet(bob, audio); check('real owners join private queues and modes remain separate');
  const paired = await join(bob, b), observed = await poll(alice, a); assert.equal(paired.state, 'matched'); assert.equal(observed.match.id, paired.match.id); assert.equal(observed.match.partner.id, bob.profileId); assert.deepEqual(observed.match.shared_interests, ['Music', 'Gaming']);
  assert.deepEqual(Object.keys(observed.match.partner).sort(), ['avatar_url', 'display_name', 'id', 'username']); check('both real Auth owners observe one current canonical pair with minimal peer metadata');
  const opened = await handoff(alice, a, observed.match.id), repeated = await handoff(bob, b, paired.match.id); assert.equal(opened.match.conversation_id, repeated.match.conversation_id);
  const cid = opened.match.conversation_id; assert.ok(cid); const memberships = await db.collection('conversation_members').where('conversation_id', '==', cid).get(); assert.equal(memberships.size, 4);
  for (const actor of [alice, bob]) assert.equal((await getDocFromServer(doc(actor.firestore, 'conversations', cid))).exists(), true);
  await assert.rejects(getDocFromServer(doc(dave.firestore, 'conversations', cid)), error => error.code === 'permission-denied'); check('text handoff creates one readable participant conversation and denies an outsider');
  const privateSession = (await db.collection('_roulette_sessions').where('uid', '==', alice.uid).get()).docs[0];
  await assert.rejects(getDocFromServer(doc(alice.firestore, privateSession.ref.path)), error => error.code === 'permission-denied');
  await assert.rejects(getDocFromServer(doc(bob.firestore, '_roulette_matches', paired.match.id)), error => error.code === 'permission-denied'); check('even participants cannot bypass the gateway to raw private sessions or match records');
  const resumedNonce = randomUUID(), resumed = await join(alice, resumedNonce, 'video', ['Art']); assert.equal(resumed.resumed, true); assert.equal(resumed.searchId, a); assert.equal(resumed.mode, 'text');
  assert.equal((await cancel(alice, resumedNonce)).state, 'ended'); assert.equal((await poll(bob, b)).state, 'ended'); assert.equal((await join(alice, a)).state, 'ended'); check('reload resumes one owned search; cancellation closes that exact pair and replay cannot revive it');
  const held = randomUUID(), joining = join(carol, held, 'text', [], { scenario: 'hold-before-domain' });
  let heldNow = false; for (let attempt = 0; attempt < 40; attempt++) { const result = await (await fetch(endpoint + '/qa/holds')).json(); if (result.users.includes(carol.uid)) { heldNow = true; break; } await new Promise(resolve => setTimeout(resolve, 50)); } assert.ok(heldNow);
  assert.equal((await cancel(carol, held)).state, 'idle'); await fetch(endpoint + '/qa/release', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid: carol.uid }) }); assert.equal((await joining).state, 'idle'); assert.equal((await ownedQueue(carol)).length, 0); check('actual out-of-order Cancel tombstone prevents a delayed first join from entering any queue');
  const failed = randomUUID(); await join(dave, failed, 'text', [], { scenario: 'fail-domain-commit', error: 'UNAVAILABLE' }); assert.equal((await ownedQueue(dave)).length, 0); check('a failed domain commit does not mint a queue or success receipt');
  await join(dave, randomUUID(), 'text', [], { scenario: 'disable-before-commit', error: 'UNAUTHENTICATED' }); assert.equal((await ownedQueue(dave)).length, 0); await auth.updateUser(dave.uid, { disabled: false }); check('disabled Auth before commit rolls back matching writes');
  await join(frank, randomUUID(), 'text', [], { scenario: 'replace-before-commit', error: 'UNAUTHENTICATED' }); assert.equal((await ownedQueue(frank)).length, 0); check('actual same-second UID replacement with different raw creation milliseconds is rejected before commit');
  await join(nadia, randomUUID(), 'text', [], { scenario: 'retire-binding-before-domain', error: 'FAILED_PRECONDITION' }); assert.equal((await ownedQueue(nadia)).length, 0); check('a retired canonical binding cannot enter matching');
  const old = randomUUID(), later = randomUUID(); assert.equal((await join(alice, old)).state, 'searching'); assert.equal((await join(bob, later, 'text', [], { shift: 31000 })).state, 'searching'); await quiet(bob, later, { shift: 31000 }); assert.equal((await poll(alice, old, { shift: 31000 })).state, 'ended'); check('expired presence cannot match an abandoned search');
  const fresh = randomUUID(); assert.equal((await join(alice, fresh)).state, 'searching'); const oldDoc = await operation(alice, old); await oldDoc.ref.update({ status: 'searching', expiresAt: Date.now() + 30000 });
  assert.equal((await poll(alice, old)).state, 'ended'); assert.equal((await ownedQueue(alice))[0].data().requestId, fresh); assert.equal((await poll(alice, fresh)).state, 'searching'); await quiet(alice, fresh); check('late old-operation cleanup preserves the newer owned queue');
  const blockPath = 'blocked_users/' + prefix + '-block'; await seed(blockPath, { blocker_id: alice.profileId, blocked_id: bob.uid });
  const blockedA = randomUUID(), blockedB = randomUUID(); assert.equal((await join(alice, blockedA)).state, 'searching'); assert.equal((await join(bob, blockedB)).state, 'searching');
  await db.doc(blockPath).delete(); const unblocked = await poll(bob, blockedB); assert.equal(unblocked.state, 'matched');
  await seed(blockPath, { blocker_id: bob.profileId, blocked_id: alice.uid }); assert.equal((await poll(alice, blockedA)).state, 'ended'); assert.equal((await poll(bob, blockedB)).state, 'ended'); await db.doc(blockPath).delete(); check('blocks are enforced across both historical aliases and revoke an already matched pair');
  await seed('parental_controls/' + carol.uid, { user_id: carol.uid, authority_version: 1, profile_id: carol.profileId, auth_created_at_ms: carol.created, binding_revision: carol.revision, is_active: true, allowed_features: ['messaging'] });
  await join(carol, randomUUID(), 'video', [], { error: 'PERMISSION_DENIED' }); assert.equal((await ownedQueue(carol)).length, 0); check('existing active parental feature restrictions prevent entering Roulette');
  const [gina, henry, iris] = await Promise.all(['gina', 'henry', 'iris'].map(player)), racers = [gina, henry, iris].map(actor => ({ actor, nonce: randomUUID() }));
  await Promise.all(racers.map(({ actor, nonce }) => join(actor, nonce, 'video', ['Art'])));
  const states = await Promise.all(racers.map(({ actor, nonce }) => poll(actor, nonce))), matched = states.flatMap((state, index) => state.state === 'matched' ? [{ state, ...racers[index] }] : []);
  assert.equal(matched.length, 2); assert.equal(new Set(matched.map(row => row.state.match.id)).size, 1); assert.equal(states.filter(state => state.state === 'searching').length, 1); check('three concurrent real joins produce one pair and one waiting owner, without double matching');
  const first = await handoff(matched[0].actor, matched[0].nonce, matched[0].state.match.id), second = await handoff(matched[1].actor, matched[1].nonce, matched[1].state.match.id);
  assert.equal(first.match.conversation_id, second.match.conversation_id); assert.equal(first.match.call_starter_profile_id, matched[0].actor.profileId); assert.equal(second.match.call_starter_profile_id, first.match.call_starter_profile_id); check('video handoff reserves one call initiator and replays the same conversation');
  await end(matched[0].actor, matched[0].nonce, matched[0].state.match.id); for (const racer of racers) await quiet(racer.actor, racer.nonce);
  const aa = randomUUID(), ab = randomUUID(); await join(alice, aa, 'audio', []); const audioMatch = await join(bob, ab, 'audio', []); assert.equal(audioMatch.state, 'matched');
  await call(carol, request(carol, 'handoff', randomUUID(), { matchId: audioMatch.match.id }), { error: 'PERMISSION_DENIED' });
  const audioHandoff = await handoff(bob, ab, audioMatch.match.id); assert.equal(audioHandoff.mode, 'audio'); assert.equal(audioHandoff.match.call_starter_profile_id, bob.profileId); await end(bob, ab, audioMatch.match.id); check('audio mode pairs and hands off through the same checked participant capability');
  await seed('roulette_matches/' + prefix + '-legacy', { user_a: alice.uid, user_b: bob.uid, status: 'active', arbitrary_legacy: 'preserved' }); const legacy = await db.doc('roulette_matches/' + prefix + '-legacy').get();
  assert.equal((await poll(alice, randomUUID())).state, 'idle'); assert.deepEqual((await legacy.ref.get()).data(), legacy.data()); check('legacy raw matching records cannot become authority and remain unchanged');
  await mkdir('work/roulette-qa', { recursive: true }); await writeFile('work/roulette-qa/verification-sdk.json', JSON.stringify({ checkedAt: new Date().toISOString(), project, passed: checks.length, checks, scope: 'Actual Node22 callable HTTP, real demo Firebase Auth tokens/Firestore SDK/transactions and exact deployed Rules. Synthetic failure/clock/race injection is confined to this exclusive loopback QA server. No production, provider, real user contact, camera or microphone action. Text/audio/video handoff is checked; actual media calls are not certified.' }, null, 2) + '\n');
} finally {
  // Cleanup is limited to registered generated users and records proving those
  // users, pair IDs or conversation IDs; no project-wide delete or reset.
  const ownedUids = new Set(users.map(user => user.uid)), pairIds = new Set(), conversations = new Set();
  for (const name of ['_roulette_sessions', '_roulette_waiting_text', '_roulette_waiting_audio', '_roulette_waiting_video']) {
    const snapshot = await db.collection(name).get(); for (const doc of snapshot.docs) if (ownedUids.has(doc.data().uid)) paths.add(doc.ref.path);
  }
  for (const actor of users) { const snapshot = await db.collectionGroup('operations').where('uid', '==', actor.uid).get(); for (const doc of snapshot.docs) { assert.ok(doc.ref.path.startsWith('_roulette_requests/')); assert.equal(doc.ref.path.split('/')[1], doc.data().key); paths.add(doc.ref.path); } paths.add('_rate_limits/roulette:' + actor.uid); }
  const matches = await db.collection('_roulette_matches').get(); for (const doc of matches.docs) if (doc.data().participants?.every(participant => ownedUids.has(participant.uid))) { pairIds.add(doc.id); paths.add(doc.ref.path); }
  const parents = await db.collection('conversations').get(); for (const doc of parents.docs) if (pairIds.has(doc.data().roulette_match_id)) { conversations.add(doc.id); paths.add(doc.ref.path); }
  const members = await db.collection('conversation_members').get(); for (const doc of members.docs) if (conversations.has(doc.data().conversation_id)) paths.add(doc.ref.path);
  for (const path of paths) await db.doc(path).delete();
  for (const actor of users) await auth.deleteUser(actor.uid).catch(error => { if (error.code !== 'auth/user-not-found') throw error; });
  for (const app of apps) await deleteApp(app); await deleteAdmin(admin);
}
