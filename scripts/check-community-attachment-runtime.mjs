import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
// Inspect actual SDK deployment endpoints with the app's fractional global CPU.
// https://firebase.google.com/docs/functions/manage-functions#allow_concurrent_requests
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'demo-vybe-attachment-runtime', storageBucket: 'demo-vybe-attachment-runtime.appspot.com' });
const require = createRequire(new URL('../functions/package.json', import.meta.url));
require('firebase-functions/v2').setGlobalOptions({ region: 'us-central1', cpu: 0.083, concurrency: 1 });
const services = await import('../functions/lib/communityAttachment.js');
for (const name of ['communityAttachment', 'communityAttachmentBytes']) {
  const endpoint = services[name].__endpoint;
  assert.ok(typeof endpoint.cpu === 'number' && (endpoint.cpu >= 1 || endpoint.concurrency === 1), `${name}: concurrent requests require a full CPU`);
  console.log(JSON.stringify({ name, cpu: endpoint.cpu, concurrency: endpoint.concurrency, memory: endpoint.availableMemoryMb }));
}
