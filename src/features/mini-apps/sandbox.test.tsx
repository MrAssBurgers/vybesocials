import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildMiniAppDocument, MINI_APP_CSP, MINI_APP_SANDBOX } from './sandbox';
import { MINI_APP_TEMPLATES } from './templates';
import { MiniAppRunner } from './MiniAppRunner';

vi.mock('framer-motion', () => ({ useReducedMotion: () => false }));
vi.mock('@/lib/theme', () => ({ useTheme: () => ({ reducedMotion: false }) }));
afterEach(cleanup);

describe('mini app isolation', () => {
  const source = MINI_APP_TEMPLATES[0].source;
  it('keeps hostile HTML inside a nested opaque-origin frame', () => {
    const hostile = `"><script>top.location='https://attacker.invalid'</script><iframe src="https://attacker.invalid"></iframe>`;
    const outer = new DOMParser().parseFromString(buildMiniAppDocument({ ...source, html: hostile }), 'text/html');
    expect(outer.querySelectorAll('script')).toHaveLength(0);
    expect(outer.querySelectorAll('iframe')).toHaveLength(1);
    const frame = outer.querySelector('iframe')!;
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
    expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(frame.getAttribute('srcdoc')).toContain(hostile);
    expect(outer.querySelector('meta[http-equiv]')?.getAttribute('content')).toContain("frame-src 'none'");
  });
  it('blocks external resources, eval, workers, forms, nested network frames, and privileges', () => {
    expect(MINI_APP_SANDBOX).not.toContain('allow-same-origin');
    for (const directive of ["default-src 'none'", "connect-src 'none'", "worker-src 'none'", "object-src 'none'", "form-action 'none'", "base-uri 'none'"]) expect(MINI_APP_CSP).toContain(directive);
    expect(MINI_APP_CSP).not.toContain('unsafe-eval');
    expect(MINI_APP_SANDBOX).toBe('allow-scripts');
  });
  it('does not let CSS or JavaScript terminate the bootstrap script', () => {
    const outer = new DOMParser().parseFromString(buildMiniAppDocument({ ...source, html: '<main>Safe</main>', css: '</script><img src=x>', javascript: 'const tag = "</script><script>";' }), 'text/html');
    const inner = new DOMParser().parseFromString(outer.querySelector('iframe')!.getAttribute('srcdoc')!, 'text/html');
    expect(inner.querySelectorAll('script')).toHaveLength(2);
    expect(inner.head.querySelector('script')?.textContent).toContain('RTCPeerConnection');
    expect(inner.body.querySelector('script')?.textContent).toMatch(/^\(\(\) =>/);
    expect(inner.querySelectorAll('img')).toHaveLength(0);
    expect(inner.querySelector('meta[http-equiv]')?.getAttribute('content')).toBe(MINI_APP_CSP);
  });
  it('only runs after an explicit action, keeps a snapshot, and removes code on Stop', () => {
    const { container, rerender } = render(<MiniAppRunner source={source} />);
    expect(container.querySelector('iframe')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Run app' }));
    const document = container.querySelector('iframe')!.srcdoc;
    expect(container.querySelector('iframe')!.getAttribute('sandbox')).toBe('allow-scripts');
    rerender(<MiniAppRunner source={{ ...source, html: '<h1>Edited code</h1>' }} />);
    expect(container.querySelector('iframe')!.srcdoc).toBe(document);
    fireEvent.click(screen.getByRole('button', { name: 'Restart' }));
    expect(container.querySelector('iframe')!.srcdoc).not.toBe(document);
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(container.querySelector('iframe')).toBeNull();
  });
});
