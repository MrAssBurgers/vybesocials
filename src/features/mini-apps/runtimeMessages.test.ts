import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { buildMiniAppDocument } from './sandbox';
import { MINI_APP_TEMPLATES } from './templates';
import { MINI_APP_ERROR_LENGTH, MINI_APP_MAX_ERRORS, MINI_APP_RUNTIME_CHANNEL, readMiniAppRuntimeMessage } from './runtimeMessages';

const packet = (kind: string, message?: unknown) => ({ channel: MINI_APP_RUNTIME_CHANNEL, runId: 'run-1', kind, message });
function bridge(which: 'inner' | 'outer') {
  const outer = new DOMParser().parseFromString(buildMiniAppDocument(MINI_APP_TEMPLATES[0].source, false, 'run-1'), 'text/html');
  const inner = new DOMParser().parseFromString(outer.querySelector('iframe')!.getAttribute('srcdoc')!, 'text/html');
  const listeners = new Map<string, { callback: (value: unknown) => void; once: boolean }>();
  const child = {};
  const send = vi.fn();
  const sandbox = {
    window: {
      addEventListener: (name: string, callback: (value: unknown) => void, options?: { once?: boolean }) => listeners.set(name, { callback, once: Boolean(options?.once) }),
      removeEventListener: (name: string) => listeners.delete(name),
    },
    parent: { postMessage: send }, document: { querySelector: () => ({ contentWindow: child }) },
  };
  // Execute the actual trusted bootstrap/relay emitted into srcdoc, not author
  // code. Browser isolation itself is verified separately in browser QA.
  runInNewContext((which === 'outer' ? outer : inner).head.querySelector('script')!.textContent!, sandbox, { timeout: 100 });
  return { child, send, listeners, emit: (name: string, value: unknown) => { const entry = listeners.get(name); if (entry?.once) listeners.delete(name); entry?.callback(value); } };
}

describe('bounded untrusted runtime diagnostics', () => {
  it('accepts only this run and strips extra host-action fields', () => {
    expect(readMiniAppRuntimeMessage({ ...packet('ready'), action: 'publish', ownerId: 'alice' }, 'run-1')).toEqual({ kind: 'ready' });
    for (const invalid of [null, 'ready', {}, { ...packet('ready'), runId: 'previous' }, packet('publish'), packet('error', {}), packet('error', ' ')]) {
      expect(readMiniAppRuntimeMessage(invalid, 'run-1')).toBeNull();
    }
    expect(readMiniAppRuntimeMessage(packet('error', 'x'.repeat(1000)), 'run-1')).toEqual({ kind: 'error', message: 'x'.repeat(MINI_APP_ERROR_LENGTH) });
  });

  it('captures synchronous and rejected-promise errors before code, but sends at most four errors and one ready', () => {
    const runtime = bridge('inner');
    runtime.emit('error', { message: 'Unexpected token' });
    runtime.emit('unhandledrejection', { reason: { message: 'Rejected operation' } });
    for (let i = 0; i < 100; i++) runtime.emit('error', { message: 'x'.repeat(1000) });
    runtime.emit('load', {}); runtime.emit('load', {});
    expect(runtime.send).toHaveBeenCalledTimes(MINI_APP_MAX_ERRORS + 1);
    expect(runtime.send.mock.calls[0][0]).toEqual(packet('error', 'Unexpected token'));
    expect(runtime.send.mock.calls[1][0]).toEqual(packet('error', 'Rejected operation'));
    expect(runtime.send.mock.calls[2][0].message).toHaveLength(MINI_APP_ERROR_LENGTH);
    expect(runtime.send.mock.lastCall?.[0]).toEqual({ channel: MINI_APP_RUNTIME_CHANNEL, runId: 'run-1', kind: 'ready' });
  });

  it('rejects foreign/nested/stale frame packets and bounds even a forged inner stream', () => {
    const runtime = bridge('outer');
    runtime.emit('message', { source: {}, data: packet('error', 'foreign') });
    runtime.emit('message', { source: runtime.child, data: { ...packet('error', 'stale'), runId: 'previous' } });
    runtime.emit('message', { source: runtime.child, data: packet('error', { html: '<img>' }) });
    expect(runtime.send).not.toHaveBeenCalled();
    for (let i = 0; i < 100; i++) {
      runtime.emit('message', { source: runtime.child, data: packet('ready') });
      runtime.emit('message', { source: runtime.child, data: { ...packet('error', 'x'.repeat(1000)), action: 'publish' } });
    }
    expect(runtime.send).toHaveBeenCalledTimes(MINI_APP_MAX_ERRORS + 1);
    expect(runtime.send.mock.calls[1][0]).toEqual(packet('error', 'x'.repeat(MINI_APP_ERROR_LENGTH)));
    expect(runtime.listeners.has('message')).toBe(false);
  });

  it('escapes hostile diagnostic identities as well as authored delimiters', () => {
    const doc = new DOMParser().parseFromString(buildMiniAppDocument(MINI_APP_TEMPLATES[0].source, false, '</script><img src=x>'), 'text/html');
    expect(doc.querySelectorAll('script')).toHaveLength(1);
    expect(doc.querySelectorAll('img')).toHaveLength(0);
    expect(doc.querySelector('script')?.textContent).toContain('\\u003c/script>');
  });
});
