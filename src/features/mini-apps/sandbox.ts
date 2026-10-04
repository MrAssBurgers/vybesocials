import type { MiniAppSource } from './model';
import { MINI_APP_ERROR_LENGTH, MINI_APP_MAX_ERRORS, MINI_APP_RUNTIME_CHANNEL } from './runtimeMessages';

// Never add allow-same-origin, popups, forms, downloads, or top navigation.
export const MINI_APP_SANDBOX = 'allow-scripts';
export const MINI_APP_PERMISSIONS = "camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'; payment 'none'; usb 'none'; fullscreen 'none'; autoplay 'none'";
export const MINI_APP_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; child-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
// CSP does not consistently gate WebRTC ICE transports across browsers. Remove
// their entry points before any author HTML executes, including inline scripts.
const networkGuard = `(() => { for (const key of ['RTCPeerConnection','webkitRTCPeerConnection','RTCIceTransport','RTCDtlsTransport','RTCSctpTransport','WebTransport']) { try { Object.defineProperty(window, key, { value: undefined, writable: false, configurable: false }); } catch {} } })();`;

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export function buildMiniAppDocument(source: MiniAppSource, reducedMotion = false, runId = ''): string {
  // Code enters only the inner opaque-origin frame. The static outer frame's
  // frame-src policy also blocks the inner frame navigating itself to a server.
  // A single srcdoc sandbox would not prevent that navigation/exfiltration path.
  const payload = scriptJson({ css: source.css, javascript: source.javascript });
  const identity = `channel:${scriptJson(MINI_APP_RUNTIME_CHANNEL)},runId:${scriptJson(runId)}`;
  // The outer document is static trusted code. Only the inner document contains
  // author HTML. Neither frame gains account APIs or an origin shared with VYBE.
  // Both ends cap forwarding; direct messages from nested/old frames are ignored.
  const diagnostics = `(() => {
    const send = parent.postMessage.bind(parent); let errors = 0;
    const report = value => { if (errors >= ${MINI_APP_MAX_ERRORS}) return; let message = 'The app reported an error.'; try { if (typeof value === 'string') message = value; else if (value && typeof value.message === 'string') message = value.message; } catch {} errors++; send({${identity},kind:'error',message:message.slice(0,${MINI_APP_ERROR_LENGTH})}, '*'); };
    window.addEventListener('error', event => { if (typeof event.message === 'string') report(event.message); });
    window.addEventListener('unhandledrejection', event => report(event.reason));
    window.addEventListener('load', () => send({${identity},kind:'ready'}, '*'), { once:true });
  })();`;
  const relay = `(() => {
    const send = parent.postMessage.bind(parent); let errors = 0; let ready = false;
    const receive = event => {
      const frame = document.querySelector('iframe'); const data = event.data;
      if (!frame || event.source !== frame.contentWindow || !data || data.channel !== ${scriptJson(MINI_APP_RUNTIME_CHANNEL)} || data.runId !== ${scriptJson(runId)}) return;
      if (data.kind === 'ready' && !ready) { ready = true; send({${identity},kind:'ready'}, '*'); }
      else if (data.kind === 'error' && errors < ${MINI_APP_MAX_ERRORS} && typeof data.message === 'string') { errors++; send({${identity},kind:'error',message:data.message.slice(0,${MINI_APP_ERROR_LENGTH})}, '*'); }
      if (ready && errors >= ${MINI_APP_MAX_ERRORS}) window.removeEventListener('message', receive);
    };
    window.addEventListener('message', receive);
  })();`;
  const inner = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${MINI_APP_CSP}"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><script>${networkGuard}${diagnostics}</script></head><body>${source.html}<script>(() => {const source = ${payload};const style = document.createElement('style');style.textContent = source.css;document.head.appendChild(style);${reducedMotion ? "const motion = document.createElement('style');motion.textContent = '* , *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }';document.head.appendChild(motion);" : ''}const script = document.createElement('script');script.textContent = source.javascript;document.body.appendChild(script);})();</script></body></html>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${MINI_APP_CSP}"><meta name="referrer" content="no-referrer"><script>${relay}</script><style>html,body,iframe{width:100%;height:100%;margin:0;border:0;display:block;background:#11111b;overflow:hidden}</style></head><body><iframe title="Mini app content" sandbox="${MINI_APP_SANDBOX}" allow="${MINI_APP_PERMISSIONS}" referrerpolicy="no-referrer" srcdoc="${escapeAttribute(inner)}"></iframe></body></html>`;
}
