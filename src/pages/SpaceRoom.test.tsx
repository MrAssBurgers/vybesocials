import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ status: 'scheduled', host: true, error: null as Error | null, start: vi.fn(), end: vi.fn(), join: vi.fn(), disconnect: vi.fn(), success: vi.fn(), failure: vi.fn() }));
vi.mock('@/components/layout/AppLayout', () => ({ AppLayout: ({ children }: any) => children }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: mocks.host ? 'host' : 'listener' }, profile: { id: mocks.host ? 'host-profile' : 'listener-profile' } }) }));
vi.mock('@/lib/haptics', () => ({ triggerHaptic: () => {} }));
vi.mock('@/lib/navVisibility', () => ({ navVisibility: { setImmersiveView: () => {} } }));
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.failure, info: vi.fn() } }));
vi.mock('@/hooks/useSpaceAudio', () => ({ useSpaceAudio: () => ({ state: 'idle', micEnabled: false, activeSpeakerIds: new Set(), disconnect: mocks.disconnect, connect: vi.fn(), setMic: vi.fn() }) }));
vi.mock('@/hooks/useSpaces', () => ({
  useSpace: () => ({ data: { id: 'scheduled-room', host_id: 'host', status: mocks.status, title: 'Existing scheduled room', scheduled_at: '2026-10-07T12:00:00Z' }, isLoading: false, error: mocks.error, refetch: vi.fn() }),
  useSpaceParticipants: () => ({ data: [{ id: 'host-member', user_id: 'host', role: 'host', profile: { id: 'host-profile', username: 'host' }, audio_pending: false, audio_generation: 1 }], error: null }),
  useStartSpace: () => ({ mutateAsync: mocks.start, isPending: false }),
  useEndSpace: () => ({ mutateAsync: mocks.end, isPending: false }),
  useJoinSpace: () => ({ mutate: mocks.join, isPending: false, isError: false }),
  useLeaveSpace: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateParticipantRole: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSetSpaceMute: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRaiseHand: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
import SpaceRoom from './SpaceRoom';
afterEach(cleanup);
const view = () => render(<MemoryRouter initialEntries={['/space/scheduled-room']}><Routes><Route path="/space/:spaceId" element={<SpaceRoom />} /><Route path="/spaces" element={<p>Audio rooms</p>} /></Routes></MemoryRouter>);
beforeEach(() => { vi.clearAllMocks(); mocks.status = 'scheduled'; mocks.host = true; mocks.error = null; mocks.start.mockResolvedValue({}); mocks.end.mockResolvedValue({}); mocks.disconnect.mockResolvedValue(undefined); });
it('scheduled host sees waiting and start controls without live audio or auto-join', () => {
  view(); expect(screen.getByText('This space hasn’t started yet.')).toBeInTheDocument(); expect(screen.queryByText('LIVE')).not.toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Start this space' })).toBeEnabled(); expect(mocks.join).not.toHaveBeenCalled();
});
it('scheduled listeners cannot start or cancel the host room', () => {
  mocks.host = false; view(); expect(screen.queryByRole('button', { name: 'Start this space' })).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Cancel this space' })).not.toBeInTheDocument(); expect(mocks.join).not.toHaveBeenCalled();
});
it('failed start shows an error and never claims the room is live', async () => {
  mocks.start.mockRejectedValue(new Error('Connection failed')); view(); fireEvent.click(screen.getByRole('button', { name: 'Start this space' }));
  await waitFor(() => expect(mocks.failure).toHaveBeenCalledWith('Connection failed')); expect(mocks.success).not.toHaveBeenCalled(); expect(screen.queryByText('LIVE')).not.toBeInTheDocument();
});
it('confirmed start alone produces the success message', async () => {
  view(); fireEvent.click(screen.getByRole('button', { name: 'Start this space' })); await waitFor(() => expect(mocks.start).toHaveBeenCalledWith('scheduled-room')); await waitFor(() => expect(mocks.success).toHaveBeenCalledWith('Your space is live. Your microphone is muted.'));
});
it('read failures show retry and pause audio rather than an empty room', async () => {
  mocks.error = new Error('Unavailable'); view(); expect(screen.getByText('This room could not be refreshed. Your audio is paused.')).toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled(); expect(screen.queryByText('Space not found')).not.toBeInTheDocument(); await waitFor(() => expect(mocks.disconnect).toHaveBeenCalled());
});
