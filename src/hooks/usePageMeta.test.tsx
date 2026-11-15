import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { usePageMeta } from './usePageMeta';
beforeEach(() => {
  window.history.replaceState({}, '', '/home');
  document.title = 'Home · VYBE';
  document.head.querySelectorAll('[data-meta-test]').forEach(node => node.remove());
  const meta = document.createElement('meta'); meta.name = 'description'; meta.content = 'Original description'; meta.dataset.metaTest = '1'; document.head.appendChild(meta);
});
afterEach(cleanup);
describe('page metadata ownership during navigation', () => {
  it('does not restore the old title over an incoming route', () => {
    const hook = renderHook(() => usePageMeta({ title: 'Home page', description: 'Home description' }));
    window.history.pushState({}, '', '/messages/search');
    document.title = 'Search Messages · VYBE';
    hook.unmount();
    expect(document.title).toBe('Search Messages · VYBE');
  });
  it('does not replace metadata already written by a newer page', () => {
    const hook = renderHook(() => usePageMeta({ title: 'Home page', description: 'Home description' }));
    const meta = document.head.querySelector('meta[name="description"]')!;
    meta.setAttribute('content', 'Incoming page description');
    hook.unmount();
    expect(meta.getAttribute('content')).toBe('Incoming page description');
  });
});
