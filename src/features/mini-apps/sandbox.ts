import type { MiniAppSource } from './model';

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

export function buildMiniAppDocument(source: MiniAppSource, reducedMotion = false): string {
  // Code enters only the inner opaque-origin frame. The static outer frame's
  // frame-src policy also blocks the inner frame navigating itself to a server.
  // A single srcdoc sandbox would not prevent that navigation/exfiltration path.
  const payload = JSON.stringify({ css: source.css, javascript: source.javascript }).replace(/</g, '\\u003c');
  const inner = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${MINI_APP_CSP}"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><script>${networkGuard}</script></head><body>${source.html}<script>(() => {const source = ${payload};const style = document.createElement('style');style.textContent = source.css;document.head.appendChild(style);${reducedMotion ? "const motion = document.createElement('style');motion.textContent = '* , *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }';document.head.appendChild(motion);" : ''}const script = document.createElement('script');script.textContent = source.javascript;document.body.appendChild(script);})();</script></body></html>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${MINI_APP_CSP}"><meta name="referrer" content="no-referrer"><style>html,body,iframe{width:100%;height:100%;margin:0;border:0;display:block;background:#11111b;overflow:hidden}</style></head><body><iframe title="Mini app content" sandbox="${MINI_APP_SANDBOX}" allow="${MINI_APP_PERMISSIONS}" referrerpolicy="no-referrer" srcdoc="${escapeAttribute(inner)}"></iframe></body></html>`;
}
