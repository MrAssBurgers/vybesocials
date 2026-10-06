import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
const projectId = 'demo-vybe-preview';
const app = initializeApp({ projectId, apiKey: 'demo-only', authDomain: 'localhost' }, 'discovery-transport-qa');
const auth = getAuth(app); connectAuthEmulator(auth, 'http://127.0.0.1:9199', { disableWarnings: true });
const functions = getFunctions(app, 'us-central1'); connectFunctionsEmulator(functions, '127.0.0.1', 5101);
try {
  const { user } = await signInWithEmailAndPassword(auth, 'bob@vybe.test', 'Vybe-local-preview-only-2026!');
  assert.equal(user.uid, 'preview-bob');
  globalThis.qaDiscoveryAuth = auth;
  globalThis.qaDiscoveryInvoke = async (name, body) => {
    assert.equal(name, 'getDiscoveryProfiles');
    try { return { data: (await httpsCallable(functions, name)(body)).data, error: null }; }
    catch (error) { return { data: null, error: { code: error.code, message: error.message } }; }
  };
  await build({ entryPoints: ['src/lib/peopleDiscoveryService.ts'], outfile: 'work/discovery-transport-client.generated.mjs', bundle: true,
    platform: 'node', format: 'esm', logLevel: 'silent', plugins: [{ name: 'real-sdk-qa', setup(builder) {
      builder.onResolve({ filter: /^\.\/firebase\/authService$/ }, () => ({ path: 'auth', namespace: 'qa' }));
      builder.onResolve({ filter: /^\.\/firebase\/functionsService$/ }, () => ({ path: 'invoke', namespace: 'qa' }));
      builder.onResolve({ filter: /^\.\/profileAccountGuard$/ }, () => ({ path: 'guard', namespace: 'qa' }));
      builder.onLoad({ filter: /.*/, namespace: 'qa' }, ({ path }) => ({ loader: 'js', contents: path === 'auth'
        ? 'export const getFirebaseAuth=()=>globalThis.qaDiscoveryAuth;'
        : path === 'invoke' ? 'export const invokeFunction=(name,body)=>globalThis.qaDiscoveryInvoke(name,body);'
          : 'export const profileAccountGuard=(uid,extra)=>()=>{extra();if(globalThis.qaDiscoveryAuth.currentUser?.uid!==uid)throw Error("Account changed");};' }));
    } }] });
  const { readPeopleDiscovery } = await import('../work/discovery-transport-client.generated.mjs');
  const started = performance.now();
  const result = await readPeopleDiscovery({ uid: user.uid, profileId: 'preview-profile-bob' }, { candidateIds: [] }, () => assert.equal(auth.currentUser, user));
  assert.deepEqual(result.profiles, []); assert.ok(result.validUntil > Date.now());
  console.log(JSON.stringify({ clientReadAccepted: true, elapsedMs: Math.round(performance.now() - started), count: result.profiles.length, ageReviewRequired: result.ageReviewRequired, productionUntouched: true }));
} finally { delete globalThis.qaDiscoveryAuth; delete globalThis.qaDiscoveryInvoke; await deleteApp(app); }
