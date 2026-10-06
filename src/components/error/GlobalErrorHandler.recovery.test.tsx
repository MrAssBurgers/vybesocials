import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
vi.mock('@/hooks/useErrorReporter', () => ({ useErrorReporter: vi.fn() }));
vi.mock('@/hooks/useAutoBugReporter', () => ({ useAutoBugReporter: vi.fn() }));
vi.mock('./BackgroundErrorReporter', () => ({ default: () => null }));
vi.mock('@/lib/firebaseAuthRefresh', () => ({ refreshFirebaseSession: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), dismiss: vi.fn(), message: vi.fn(), success: vi.fn() } }));
vi.mock('@/lib/bootGuard', () => ({ showBootRecovery: vi.fn() }));
import { toast } from 'sonner';
import { showBootRecovery } from '@/lib/bootGuard';
import { GlobalErrorHandler } from './GlobalErrorHandler';

function rejectModule() {
  const event = new Event('unhandledrejection');
  Object.defineProperty(event, 'reason', { value: new Error('Failed to fetch dynamically imported module: /assets/old.js') });
  window.dispatchEvent(event);
}

describe('screen recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.__VYBE_HAS_MEANINGFUL_CONTENT__ = () => true;
  });
  afterEach(() => { cleanup(); delete window.__VYBE_HAS_MEANINGFUL_CONTENT__; });
  function mount() {
    render(<QueryClientProvider client={new QueryClient()}><GlobalErrorHandler /></QueryClientProvider>);
  }
  it('offers one explicit refresh for rejected route imports without discarding the current screen', () => {
    mount();
    rejectModule();
    rejectModule();
    expect(toast.error).toHaveBeenCalledOnce();
    expect(toast.error).toHaveBeenCalledWith('This screen couldn’t load', expect.objectContaining({
      duration: Infinity, action: expect.objectContaining({ label: 'Refresh', onClick: expect.any(Function) }),
    }));
    expect(showBootRecovery).not.toHaveBeenCalled();
  });
  it('uses startup recovery when an import fails before any screen loads', () => {
    window.__VYBE_HAS_MEANINGFUL_CONTENT__ = () => false;
    mount();
    rejectModule();
    expect(showBootRecovery).toHaveBeenCalledWith('chunk_error');
    expect(toast.error).not.toHaveBeenCalled();
  });
  it('does not offer an update for an ordinary failed network request', () => {
    mount();
    window.dispatchEvent(new ErrorEvent('error', { message: 'Failed to fetch' }));
    expect(toast.error).not.toHaveBeenCalled();
    expect(showBootRecovery).not.toHaveBeenCalled();
  });
  it('removes its recovery listener on unmount', () => {
    mount();
    cleanup();
    rejectModule();
    expect(toast.error).not.toHaveBeenCalled();
  });
});
