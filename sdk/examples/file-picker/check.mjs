import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { request } from 'node:http';

test('built example serves only its fixed local files', { timeout: 15_000 }, async () => {
  const child = spawn(process.execPath, [fileURLToPath(new URL('serve.mjs', import.meta.url))], { stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', () => reject(new Error('The example could not start; port 4176 must be free.')));
      child.stdout.once('data', bytes => String(bytes).includes('http://127.0.0.1:4176') ? resolve() : reject(new Error('Unexpected example server response.')));
    });
    for (const path of ['/', '/app.js', '/config.js', '/sdk/universal/index.js', '/sdk/game/http.js', '/sdk/game/index.js']) {
      const response = await fetch(`http://127.0.0.1:4176${path}`);
      assert.equal(response.status, 200, path);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.ok((await response.text()).length > 0);
    }
    for (const path of ['/package.json', '/app.js?file=secret', '/sdk/game/firebase.js']) {
      assert.equal((await fetch(`http://127.0.0.1:4176${path}`)).status, 404, path);
    }
    // Fetch normalizes dot segments before sending; use the raw path to test
    // the server's exact allowlist instead of testing URL normalization.
    const traversal = await new Promise((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port: 4176, path: '/%2e%2e/config.js' }, res => { res.resume(); resolve(res.statusCode); });
      req.on('error', reject); req.end();
    });
    assert.equal(traversal, 404);
    assert.equal((await fetch('http://127.0.0.1:4176/', { method: 'POST' })).status, 404);
    const foreignHost = await new Promise((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port: 4176, path: '/', headers: { Host: 'untrusted.example' } }, res => { res.resume(); resolve(res.statusCode); });
      req.on('error', reject); req.end();
    });
    assert.equal(foreignHost, 404);
  } finally {
    child.kill();
  }
});
