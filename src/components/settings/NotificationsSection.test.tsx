import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ query: { data: undefined as undefined | Record<string, unknown>, revision: undefined as string | undefined, isError: false, refetch: vi.fn() }, update: { isPending: false, mutateAsync: vi.fn() }, toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() }, from: vi.fn(), epoch: 1 }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: 'alice' }, profile: { id: 'profile-alice', user_id: 'alice' } }) }));
vi.mock('@/hooks/useNotificationPreferences', () => ({ useNotificationPreferences: () => state.query, useUpdateNotificationPreference: () => state.update }));
vi.mock('@/hooks/usePushNotifications', () => ({ usePushNotifications: () => ({ isSupported: false, isSubscribed: false, isLoading: false }) }));
vi.mock('@/lib/firebase', () => ({ db: { from: state.from, functions: { invoke: vi.fn() } } }));
vi.mock('@/lib/despiaOneSignal', () => ({ fireDespiaTestPushInstant: vi.fn() }));
vi.mock('@/lib/despiaBridge', () => ({ isDespiaRuntime: () => false }));
vi.mock('@/lib/haptics', () => ({ haptics: { tap: vi.fn() } }));
vi.mock('@/lib/tokenMarketplaceService', () => ({ tokenAccountGuard: () => { const epoch = state.epoch; return () => { if (epoch !== state.epoch) throw new Error('Account changed'); }; } }));
vi.mock('sonner', () => ({ toast: state.toast }));
import { NotificationsSection } from './NotificationsSection';
beforeEach(() => { vi.clearAllMocks(); state.epoch = 1; state.query = { data: undefined, revision: undefined, isError: false, refetch: vi.fn() }; state.update.isPending = false; });
afterEach(cleanup);
it('shows a retryable read failure without enabled default switches', () => {
  state.query.isError = true; render(<NotificationsSection />); expect(screen.getByRole('alert')).toHaveTextContent('Could not load'); expect(screen.queryByRole('switch', { name: 'Announcements', exact: true })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Retry notification preferences' })); expect(state.query.refetch).toHaveBeenCalledOnce();
});
it('disabling announcements awaits a receipt and never deletes inbox contents', async () => {
  state.query.data = { announcements_enabled: true }; state.query.revision = 'a'.repeat(64); let done!: (value: unknown) => void; state.update.mutateAsync.mockReturnValue(new Promise(resolve => { done = resolve; })); render(<NotificationsSection />);
  fireEvent.click(screen.getByRole('switch', { name: 'Announcements', exact: true })); expect(state.toast.success).not.toHaveBeenCalled(); expect(state.from).not.toHaveBeenCalled();
  await act(async () => done({ preferences: { announcements_enabled: false } })); expect(state.toast.success).toHaveBeenCalledWith('Notification preference saved'); expect(state.from).not.toHaveBeenCalled();
});
it('a failed save never displays success or clears old notifications', async () => {
  state.query.data = { announcements_enabled: true }; state.query.revision = 'a'.repeat(64); state.update.mutateAsync.mockRejectedValue(new Error('Save unavailable')); render(<NotificationsSection />);
  fireEvent.click(screen.getByRole('switch', { name: 'Announcements', exact: true })); await waitFor(() => expect(state.toast.error).toHaveBeenCalledWith('Save unavailable')); expect(state.toast.success).not.toHaveBeenCalled(); expect(state.from).not.toHaveBeenCalled();
});
it('retired view feedback stays silent after account changes', async () => {
  state.query.data = { announcements_enabled: true }; state.query.revision = 'a'.repeat(64); let done!: (value: unknown) => void; state.update.mutateAsync.mockReturnValue(new Promise(resolve => { done = resolve; })); render(<NotificationsSection />);
  fireEvent.click(screen.getByRole('switch', { name: 'Announcements', exact: true })); state.epoch += 2; await act(async () => done({ preferences: { announcements_enabled: false } })); expect(state.toast.success).not.toHaveBeenCalled(); expect(state.toast.error).not.toHaveBeenCalled();
});
