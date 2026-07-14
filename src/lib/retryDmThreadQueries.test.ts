import { describe, expect, it, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { messagesQueryKey } from '@/lib/messagesQueryKey';
import {
  cancelStaleDmMessageQueries,
  retryDmThreadQueries,
} from '@/lib/retryDmThreadQueries';

describe('retryDmThreadQueries', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('invalidates and refetches thread queries without remounting the app', () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const cancel = vi.spyOn(qc, 'cancelQueries');
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    const refetch = vi.spyOn(qc, 'refetchQueries');

    retryDmThreadQueries(qc, 'conv-a');

    expect(cancel).toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalled();
    expect(refetch).toHaveBeenCalled();
    const payload = JSON.stringify([
      cancel.mock.calls,
      invalidate.mock.calls,
      refetch.mock.calls,
    ]);
    expect(payload).toContain('messages');
    expect(payload).toContain('conversation-detail');
  });
});

describe('cancelStaleDmMessageQueries', () => {
  it('targets only non-selected message query keys', () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const cancel = vi.spyOn(qc, 'cancelQueries');

    cancelStaleDmMessageQueries(qc, 'conv-b');

    expect(cancel).toHaveBeenCalledTimes(1);
    const arg = cancel.mock.calls[0]?.[0] as {
      predicate?: (q: { queryKey: unknown[] }) => boolean;
    };
    expect(arg?.predicate).toBeTypeOf('function');
    expect(
      arg!.predicate!({ queryKey: messagesQueryKey('conv-a') }),
    ).toBe(true);
    expect(
      arg!.predicate!({ queryKey: messagesQueryKey('conv-b') }),
    ).toBe(false);
    expect(arg!.predicate!({ queryKey: ['conversation-detail', 'conv-a'] })).toBe(
      false,
    );
  });
});
