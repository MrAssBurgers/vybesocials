import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { openSheetCountForTests, useSheetBackStack } from './useSheetBackStack';

describe('useSheetBackStack', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers an open sheet on the back stack', () => {
    const close = vi.fn();
    const { rerender, unmount } = renderHook(
      ({ open }) => useSheetBackStack(open, close, 'test-sheet'),
      { initialProps: { open: true } },
    );
    expect(openSheetCountForTests()).toBe(1);
    rerender({ open: false });
    unmount();
  });
});
