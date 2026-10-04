import { VybeIntegration } from '/sdk/universal/index.js';
import { config } from './config.js';

const element = id => document.getElementById(id);
const status = message => { element('status').textContent = message; };
let current = null;
let draft = null;
let captureId = null;
let receipt = null;
let linkAvailable = false;
let closed = false;
let client;

function resetDraft() { draft?.dispose(); draft = null; captureId = null; receipt = null; }
function refresh() {
  const connected = Boolean(client?.authorization);
  const busy = Boolean(current);
  element('connect').disabled = !client || busy;
  element('open-link').disabled = !linkAvailable;
  element('revoke').disabled = !connected || busy;
  element('upload').disabled = !connected || busy || Boolean(draft) || !element('file').files[0];
  element('retry').disabled = !connected || busy || !draft;
  element('cancel').disabled = !busy;
  element('review').disabled = !receipt || !['ready', 'imported'].includes(receipt.status);
  element('discard').disabled = !connected || busy || !captureId || receipt?.status === 'imported';
  element('reset').disabled = busy || !draft;
  element('file').disabled = busy || Boolean(draft);
  element('caption').disabled = busy || Boolean(draft);
}
async function run(action) {
  if (current || closed) return;
  const operation = new AbortController(); current = operation; refresh();
  const live = () => !closed && current === operation && !operation.signal.aborted;
  try { await action(operation.signal, live); }
  catch (error) { if (!closed && current === operation) status(error instanceof Error ? error.message : 'The action was not confirmed.'); }
  finally { if (current === operation) { current = null; refresh(); } }
}
function open(action) {
  try { Promise.resolve(action()).catch(error => { if (!closed) status(error.message); }); }
  catch (error) { status(error.message); }
}

try {
  if (!config.apiBaseUrl || config.clientId.startsWith('replace-')) throw new Error('Set the registered client ID and fixed HTTPS endpoint in config.js, then reload. No API is called until you connect.');
  client = new VybeIntegration({ ...config, host: {
    openExternal(url) {
      // Synchronous call from the button click. Retain an opener only long enough
      // to detect a blocked popup, then remove it before loading the official URL.
      const popup = window.open('about:blank', '_blank');
      if (!popup) throw new Error('Browser blocked the new tab.');
      popup.opener = null; popup.location.replace(url);
    },
    async capture({ signal }) {
      signal.throwIfAborted();
      const file = element('file').files[0];
      if (!file) throw new Error('Choose a file.');
      return { media: file, contentType: file.type, caption: element('caption').value, tags: [] };
    },
    onDispose(callback) {
      const unload = () => { closed = true; current?.abort(); callback(); };
      window.addEventListener('pagehide', unload, { once: true });
      return () => window.removeEventListener('pagehide', unload);
    },
  } });
  element('configuration').textContent = `Registered integration: ${config.clientId}. Verify its publisher on the VYBE consent page.`;
} catch (error) { element('configuration').textContent = error.message; }

element('connect').onclick = () => run(async (signal, live) => {
  resetDraft(); linkAvailable = false; element('code').textContent = '';
  const link = await client.beginLink({ signal });
  if (!live()) return;
  linkAvailable = true; element('code').textContent = `Match this code in VYBE: ${link.userCode}`; status('Open the consent page, check the publisher and approve if you want to connect.'); refresh();
  try { await client.waitForLink({ signal }); if (live()) status('Connected. Choose a capture to upload. Access lasts up to ten minutes.'); }
  finally { linkAvailable = false; element('code').textContent = ''; }
});
element('open-link').onclick = () => open(() => client.openLink());
element('open-vybe').onclick = () => {
  if (client) open(() => client.openVybe()); else status('Configure this example before using its VYBE controls.');
};
element('review').onclick = () => open(() => client.openReview(receipt.captureId));
async function upload(signal, live) {
  if (!draft) draft = await client.captureFromHost({ signal });
  if (!live()) return;
  receipt = await client.stageCapture(draft, {
    signal,
    onCaptureReserved: id => { if (live()) captureId = id; },
    onPhase: phase => { if (live()) status(phase === 'verifying' ? 'Verifying the private capture…' : `Capture: ${phase}`); },
    onProgress: fraction => { if (live()) status(`Transferred ${Math.round(fraction * 100)}%. Waiting for verified completion.`); },
  });
  if (live()) status(receipt.status === 'imported' ? 'This capture was already published in VYBE.' : 'Private capture ready. Open VYBE to review and choose whether to publish.');
}
element('upload').onclick = () => run(upload);
element('retry').onclick = () => run(upload);
element('cancel').onclick = () => { current?.abort(); };
element('discard').onclick = () => run(async (signal, live) => { await client.discardCapture(captureId, { signal }); if (live()) { resetDraft(); status('Private capture discarded.'); } });
element('revoke').onclick = () => run(async (signal, live) => { try { await client.revokeConnection({ signal }); if (live()) status('Connection revoked.'); } finally { resetDraft(); } });
element('reset').onclick = () => { resetDraft(); status('Choose another capture. Any earlier uploaded capture remains private in VYBE until discarded or expired.'); refresh(); };
element('file').onchange = refresh;
// Back/forward-cache restoration must not revive a disposed host session.
window.addEventListener('pageshow', event => { if (event.persisted) window.location.reload(); });
refresh();
