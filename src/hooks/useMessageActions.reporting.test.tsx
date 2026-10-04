import { type PropsWithChildren } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ profile: { id: 'alice' } as { id: string } | null, from: vi.fn(), rpc: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ profile: mocks.profile }) }));
vi.mock('@/lib/firebase', () => ({ db: { from: mocks.from, rpc: mocks.rpc } }));
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }));
import { useReportMessage } from './useMessageActions';

describe('message reporting availability', () => {
  beforeEach(() => { mocks.profile = { id: 'alice' }; vi.clearAllMocks(); });
  afterEach(() => vi.restoreAllMocks());
  const setup = () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
    const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    return { client, ...renderHook(useReportMessage, { wrapper }) };
  };

  it('rejects an unsupported report with useful guidance and never logs private details or claims success', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const hook = setup();
    await act(async () => {
      await expect(hook.result.current.mutateAsync({ messageId: 'private-message', reason: 'Private report text' })).rejects.toThrow('Message-specific reporting is not available yet');
    });
    expect(mocks.error).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('report or block the account from its profile'));
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    expect(debug).not.toHaveBeenCalled();
    hook.unmount(); hook.client.clear();
  });

  it('does not claim a submission when signed out', async () => {
    mocks.profile = null;
    const hook = setup();
    await act(async () => { await expect(hook.result.current.mutateAsync({ messageId: 'message', reason: 'spam' })).rejects.toThrow('Not authenticated'); });
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    hook.unmount(); hook.client.clear();
  });
});
