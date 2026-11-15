import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
const h = vi.hoisted(() => ({ uid: 'alice', profileId: 'profile-alice', epoch: 1, reduced: true, phase: 'idle', navigate: vi.fn(), start: vi.fn(), handoff: vi.fn(), find: vi.fn(), cancel: vi.fn(), end: vi.fn(), skip: vi.fn(), retry: vi.fn(), view: {} as any, animations: [] as any[] }));
vi.mock('@/components/layout/AppLayout', () => ({ AppLayout: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('@/hooks/useAuthProfileId', () => ({ useAuthProfileId: () => h.profileId }));
vi.mock('@/hooks/useReportAccountSession', () => ({ useReportAccountSession: () => ({ uid: h.uid, epoch: h.epoch }) }));
vi.mock('@/hooks/useRouletteMatch', () => ({ useRouletteMatch: () => ({ ...h.view, findMatch: h.find, cancelSearch: h.cancel, endMatch: h.end, skipToNext: h.skip, retry: h.retry, handoff: h.handoff }) }));
vi.mock('@/lib/callStore', () => ({ useCallStore: () => ({ state: { phase: h.phase }, startCall: h.start }) }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountGuard: (uid: string) => { const epoch = h.epoch; return () => { if (uid !== h.uid || epoch !== h.epoch) throw new Error('Account changed'); }; } }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: vi.fn() }));
vi.mock('@/components/safety/QuickSafetyActions', () => ({ QuickSafetyActions: ({ targetUserId, targetUsername }: any) => <button aria-label={'Report @' + targetUsername} data-target={targetUserId}>Report</button> }));
vi.mock('react-router-dom', () => ({ useNavigate: () => h.navigate }));
vi.mock('framer-motion', async () => {
  const React = await import('react'); const cache = new Map();
  return { useReducedMotion: () => h.reduced, AnimatePresence: ({ children }: any) => <>{children}</>, motion: new Proxy({}, { get: (_target, element: string) => {
    if (!cache.has(element)) cache.set(element, React.forwardRef((props: any, ref: any) => { const { initial, animate, exit, transition, whileTap, children, ...rest } = props; h.animations.push({ initial, animate, exit, transition, whileTap }); return React.createElement(element, { ...rest, ref }, children); })); return cache.get(element);
  } }) };
});
import VYBERoulette from './VYBERoulette';
function pair(mode: 'text' | 'audio' | 'video' = 'text', starter: string | null = null) { return { id: 'match-one', user_a: 'profile-alice', user_b: 'profile-bob', mode, status: 'active', shared_interests: ['Music'], conversation_id: null, started_at: '2026-11-14T12:00:00Z', call_starter_profile_id: starter, partner: { id: 'profile-bob', username: 'bob', avatar_url: null, display_name: 'Bob' } }; }
beforeEach(() => {
  h.uid = 'alice'; h.profileId = 'profile-alice'; h.epoch = 1; h.reduced = true; h.phase = 'idle'; h.animations = [];
  for (const method of [h.navigate, h.start, h.handoff, h.find, h.cancel, h.end, h.skip, h.retry]) method.mockReset().mockResolvedValue(undefined);
  h.view = { status: 'idle', match: null, error: null, pendingAction: null, activeMode: 'text', activeInterests: [], notice: null, ready: true };
});
afterEach(cleanup);
it('uses native pressed controls for modes/interests and enforces the five-vibe limit', async () => {
  render(<VYBERoulette />); fireEvent.click(screen.getByRole('button', { name: /^Audio/ }));
  for (const name of ['Music', 'Gaming', 'Art', 'Tech', 'Fashion']) fireEvent.click(screen.getByRole('button', { name, exact: true }));
  expect(screen.getByRole('button', { name: /^Audio/ })).toHaveAttribute('aria-pressed', 'true'); expect(screen.getByRole('button', { name: 'Sports', exact: true })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Music', exact: true })); expect(screen.getByRole('button', { name: 'Sports', exact: true })).toBeEnabled();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Find My Vibe Match' })); });
  expect(h.find).toHaveBeenCalledWith('audio', ['Gaming', 'Art', 'Tech', 'Fashion']); expect(screen.getByRole('button', { name: 'Go back' })).toBeEnabled();
});
it('keeps failed-leave recovery visible while searching and offers Retry', async () => {
  h.view.status = 'searching'; h.view.error = 'Could not leave your search. Retry.'; render(<VYBERoulette />);
  expect(screen.getByRole('alert')).toHaveTextContent('Could not leave');
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry Roulette' })); fireEvent.click(screen.getByRole('button', { name: 'Cancel search' })); });
  expect(h.retry).toHaveBeenCalledOnce(); expect(h.cancel).toHaveBeenCalledOnce();
});
it('renders a complete ended state instead of an empty page', () => {
  h.view.status = 'ended'; render(<VYBERoulette />); expect(screen.getByRole('status')).toHaveTextContent('session has ended'); expect(screen.getByRole('button', { name: 'Find My Vibe Match' })).toBeVisible();
});
it('opens an acknowledged text conversation instead of navigating to a profile', async () => {
  const match = pair(); h.view.status = 'matched'; h.view.match = match; h.handoff.mockResolvedValue({ ...match, conversation_id: 'conversation-one' }); render(<VYBERoulette />);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Open chat' })); });
  expect(h.navigate).toHaveBeenCalledWith('/messages/conversation-one'); expect(h.start).not.toHaveBeenCalled(); expect(screen.getByRole('button', { name: 'Report @bob' })).toHaveAttribute('data-target', 'profile-bob');
});
it.each(['audio', 'video'] as const)('hands the selected %s mode to the existing call flow with verified participant IDs', async mode => {
  const match = pair(mode); h.view.status = 'matched'; h.view.match = match; h.handoff.mockResolvedValue({ ...match, conversation_id: 'conversation-one', call_starter_profile_id: 'profile-alice' }); render(<VYBERoulette />);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Start ' + mode + ' call' })); });
  expect(h.start).toHaveBeenCalledWith(expect.objectContaining({ callType: mode, conversationId: 'conversation-one', receiverId: 'profile-bob', receiverUsername: 'bob' })); expect(h.navigate).not.toHaveBeenCalled();
});
it('lets the other participant open chat without creating a second call', async () => {
  const match = pair('video', 'profile-bob'); h.phase = 'connected'; h.view.status = 'matched'; h.view.match = match; h.handoff.mockResolvedValue({ ...match, conversation_id: 'conversation-one' }); render(<VYBERoulette />);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Open chat' })); });
  expect(h.navigate).toHaveBeenCalledWith('/messages/conversation-one'); expect(h.start).not.toHaveBeenCalled();
});
it('cannot start another call while the current one is active', () => {
  h.phase = 'joining'; h.view.status = 'matched'; h.view.match = pair('audio'); render(<VYBERoulette />); expect(screen.getByRole('button', { name: 'Start audio call' })).toBeDisabled();
});
it('retires a pending text handoff before navigation after an account change', async () => {
  let resolve!: (value: any) => void; const match = pair(); h.handoff.mockReturnValueOnce(new Promise(done => { resolve = done; })); h.view.status = 'matched'; h.view.match = match;
  const page = render(<VYBERoulette />); act(() => { fireEvent.click(screen.getByRole('button', { name: 'Open chat' })); });
  h.uid = 'charlie'; h.profileId = 'profile-charlie'; h.epoch++; page.rerender(<VYBERoulette />);
  await act(async () => { resolve({ ...match, conversation_id: 'old-chat' }); }); expect(h.navigate).not.toHaveBeenCalled(); expect(h.start).not.toHaveBeenCalled();
});
it('respects reduced motion during the waiting animation', () => {
  h.view.status = 'searching'; render(<VYBERoulette />); expect(h.animations.every(animation => animation.transition?.repeat !== Infinity)).toBe(true);
});
