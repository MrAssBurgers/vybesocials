import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const origin = 'https://vybehub.app';
const expected = JSON.parse(fs.readFileSync('releases/client-polish-20261116/verification-local.json'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function get(path) { const url = new URL(path, origin); assert.equal(url.origin, origin); const response = await fetch(url, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(30000) }); assert.equal(response.status, 200, path + ' returned ' + response.status); return { response, bytes: Buffer.from(await response.arrayBuffer()) }; }
const versionResult = await get('/version.json?qa=' + Date.now());
const version = JSON.parse(versionResult.bytes);
const requiredCommit = process.argv[2];
assert.match(requiredCommit || '', /^[a-f0-9]{40}$/, 'Supply the exact published main commit');
assert.equal(version.commit, requiredCommit, 'Published commit is not the selected main candidate');
assert.equal(version.source_sha256, expected.source_sha256, 'Public client source is not the tested candidate');
for (const name of ['source_schema','source_files','source_parts','source_config','source_public','runtime_dependencies']) assert.deepEqual(version[name], expected[name], 'Source/runtime mismatch: ' + name);
const entry = await get(version.entry); assert.equal(hash(entry.bytes), version.entry_sha256, 'Published entry hash mismatch');
const stableEntry = await get('/assets/app.js'); assert.equal(hash(stableEntry.bytes), version.entry_sha256, 'Stable native facade is not the selected hashed entry');
const routes = ['/', '/login', '/signup', '/home', '/profile', '/messages', '/community', '/map', '/explore', '/clips', '/settings', '/about', '/contact', '/faq', '/delete-account', '/roulette'];
for (const route of routes) { const page = await get(route); const html = page.bytes.toString(); assert.ok(html.includes('id="root"'), route + ' is not the app shell'); assert.ok(html.includes(version.entry), route + ' entry differs from version metadata'); }
const manifest = JSON.parse((await get('/despia/local.json?qa=' + Date.now())).bytes); assert.equal(manifest.entry, '/index.html'); assert.ok(manifest.assets.includes(version.entry));
const assets = [...new Set(manifest.assets)]; let next = 0, checked = 0; const failures = [];
await Promise.all(Array.from({length:8}, async () => { while (next < assets.length) { const asset = assets[next++]; try { const result = await get(asset); if (/\.(?:js|css|json|wasm|png|jpe?g|webp|avif|svg|mp3|wav|ogg|mp4|woff2?|ico)(?:$|\?)/i.test(asset)) assert.ok(!/text\/html/i.test(result.response.headers.get('content-type') || '') && !/^\s*<!doctype html/i.test(result.bytes.toString('utf8',0,60)), 'Typed asset returned HTML: ' + asset); checked++; } catch(error) { failures.push({asset,error:error.message}); } } }));
const evidence = { checkedAt:new Date().toISOString(), commit:version.commit, sourceSha256:version.source_sha256, sourceFiles:version.source_files, entry:version.entry, entrySha256:version.entry_sha256, builtAt:version.built_at, routes, assets:checked, nativeDeployedAt:manifest.deployed_at, failures, scope:'Exact public source/runtime/entry integrity, sixteen route shells and native manifest delivery. Not a certification of signed-in transactions, provider integrations, native adoption, GPS, calling or sustained media/animation performance.' };
fs.writeFileSync('releases/client-polish-20261116/verification-public.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence,null,2));assert.equal(failures.length,0);assert.equal(checked,assets.length);
