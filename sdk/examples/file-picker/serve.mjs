import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/config.js', ['config.js', 'text/javascript; charset=utf-8']],
  ['/sdk/universal/index.js', ['../../dist/universal/index.js', 'text/javascript; charset=utf-8']],
  ['/sdk/universal/feed.js', ['../../dist/universal/feed.js', 'text/javascript; charset=utf-8']],
  ['/sdk/universal/gallery.js', ['../../dist/universal/gallery.js', 'text/javascript; charset=utf-8']],
  ['/sdk/game/publicFeed.js', ['../../dist/game/publicFeed.js', 'text/javascript; charset=utf-8']],
  ['/sdk/game/http.js', ['../../dist/game/http.js', 'text/javascript; charset=utf-8']],
  ['/sdk/game/index.js', ['../../dist/game/index.js', 'text/javascript; charset=utf-8']],
]);
const server = createServer(async (request, response) => {
  // This is a fixed static example server, never an arbitrary filesystem/proxy endpoint.
  const file = files.get(request.url);
  if (request.method !== 'GET' || !file || request.headers.host !== '127.0.0.1:4176') { response.writeHead(404); response.end(); return; }
  try {
    const bytes = await readFile(new URL(file[0], import.meta.url));
    response.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' }); response.end(bytes);
  } catch { response.writeHead(503, { 'Content-Type': 'text/plain' }); response.end('Build the SDK before starting this example.'); }
});
server.listen(4176, '127.0.0.1', () => { process.stdout.write('VYBE example: http://127.0.0.1:4176\n'); });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
