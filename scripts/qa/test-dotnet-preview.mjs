import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Exact isolated demo targets only, before SDK imports, registry writes or child execution.
for (const [name, value] of Object.entries({ GCLOUD_PROJECT: 'demo-vybe-preview', FUNCTIONS_EMULATOR_HOST: '127.0.0.1:5101',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9199', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8280', FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9399' })) assert.equal(process.env[name], value);
const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const app = initializeApp({ projectId: 'demo-vybe-preview' }); const db = getFirestore(app);
const repo = fileURLToPath(new URL('../../', import.meta.url));
let child;
try {
  const ref = db.doc('game_integrations/local-dotnet-mod'); const existing = await ref.get();
  if (!existing.exists) await ref.create({ enabled: true, partner_enabled: true, publisher_verified: true,
    display_name: 'Local .NET Mod', publisher_name: 'Synthetic QA', max_upload_bytes: 48 * 1024 * 1024 });
  else assert.equal(existing.data().publisher_name, 'Synthetic QA');
  const signIn = await fetch('http://127.0.0.1:9199/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-local-only', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'alice@vybe.test', password: 'Vybe-local-preview-only-2026!', returnSecureToken: true }),
  });
  assert.equal(signIn.status, 200); const account = await signIn.json(); assert.equal(account.localId, 'preview-alice');
  child = spawn('dotnet', ['run', '--no-build', '--project', 'sdk/dotnet/Vybe.Integration.Checks', '-c', 'Release', '--', '--emulator'], { cwd: repo, env: process.env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  const finished = new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
  let stderr = ''; child.stderr.on('data', part => { stderr += part.toString(); });
  const watchdog = setTimeout(() => child.kill(), 110_000);
  let result;
  try {
    for await (const line of createInterface({ input: child.stdout })) {
      const event = JSON.parse(line);
      if (event.eventType === 'link') {
        assert.match(event.userCode, /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
        const approved = await fetch('http://127.0.0.1:5101/demo-vybe-preview/us-central1/approveGamePartnerLink', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${account.idToken}` },
          body: JSON.stringify({ data: { userCode: event.userCode, approvedScopes: ['capture:write', 'capture:status', 'capture:preview'] } }),
        });
        assert.equal(approved.status, 200, 'Synthetic approval failed');
      } else { assert.equal(event.eventType, 'complete'); result = event; }
    }
    assert.equal(await finished, 0, stderr); assert.ok(result);
    const capture = (await db.doc(`game_captures/${result.captureId}`).get()).data();
    assert.equal(capture.owner_uid, 'preview-alice'); assert.equal(capture.status, 'ready');
    assert.equal(capture.game_id, 'local-dotnet-mod');
    await mkdir(path.join(repo, 'work/dotnet-preview'), { recursive: true });
    await writeFile(path.join(repo, 'work/dotnet-preview/result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } finally { clearTimeout(watchdog); }
} finally { if (child && child.exitCode === null) child.kill(); await db.terminate(); await deleteApp(app); }
