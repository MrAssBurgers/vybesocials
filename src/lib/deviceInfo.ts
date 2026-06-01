/**
 * Collects a snapshot of device/runtime context that helps debug crashes.
 * Returns a plain text block safe to embed inside error_stack / component_stack.
 */
export function getDeviceInfoText(): string {
  if (typeof window === 'undefined') return 'device: ssr';
  const n = navigator as any;
  const s = window.screen || ({} as Screen);
  const memory = (performance as any)?.memory;
  const conn = n?.connection || {};
  const despia = !!(window as any).Despia || /Despia/i.test(n?.userAgent || '');
  const standalone =
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    (n.standalone === true);

  const lines = [
    `platform: ${n?.platform || 'n/a'}`,
    `userAgent: ${(n?.userAgent || '').slice(0, 240)}`,
    `language: ${n?.language || 'n/a'}`,
    `vendor: ${n?.vendor || 'n/a'}`,
    `runtime: ${despia ? 'despia-native' : standalone ? 'pwa-standalone' : 'web'}`,
    `viewport: ${window.innerWidth}x${window.innerHeight} dpr=${window.devicePixelRatio}`,
    `screen: ${s.width || '?'}x${s.height || '?'} avail=${s.availWidth || '?'}x${s.availHeight || '?'}`,
    `online: ${n?.onLine}`,
    `connection: ${conn.effectiveType || 'n/a'} downlink=${conn.downlink ?? 'n/a'} rtt=${conn.rtt ?? 'n/a'} saveData=${!!conn.saveData}`,
    `memory(MB): used=${memory ? Math.round(memory.usedJSHeapSize / 1048576) : 'n/a'} total=${memory ? Math.round(memory.totalJSHeapSize / 1048576) : 'n/a'} limit=${memory ? Math.round(memory.jsHeapSizeLimit / 1048576) : 'n/a'}`,
    `route: ${window.location.pathname}${window.location.search}`,
    `time: ${new Date().toISOString()}`,
  ];

  return `--- DEVICE INFO ---\n${lines.join('\n')}\n--- /DEVICE INFO ---`;
}
