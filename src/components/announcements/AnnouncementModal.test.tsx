import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({
  rows: [] as any[], uid: 'alice', profileId: 'profile-alice', epoch: 1,
  isError: false, refetch: vi.fn(), dismiss: vi.fn(), dismissAsync: vi.fn(),
}));
vi.mock('@/hooks/useAnnouncements', () => ({
  useAnnouncements: () => ({ data: h.rows, isError: h.isError, isFetching: false, refetch: h.refetch }),
  useDismissAnnouncement: () => ({ isPending: false, mutate: h.dismiss, mutateAsync: h.dismissAsync }),
}));
vi.mock('@/hooks/useAuthProfileId', () => ({ useAuthProfileId: () => h.profileId }));
vi.mock('@/hooks/useReportAccountSession', () => ({ useReportAccountSession: () => ({ uid: h.uid, epoch: h.epoch }) }));
import { AnnouncementModal } from './AnnouncementModal';
const announcement = (id = 'welcome', title = 'Welcome to the club') => ({ id, title, content: 'A few things to explore today.', image_url: null, media_type: null, author_id: 'staff', created_at: '2026-11-14T12:00:00Z', expires_at: null, is_active: true, author: { username: 'vybe' } });
beforeEach(() => {
  h.rows = [announcement()]; h.uid = 'alice'; h.profileId = 'profile-alice'; h.epoch = 1; h.isError = false;
  h.refetch.mockReset(); h.dismiss.mockReset(); h.dismissAsync.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);
async function openAnnouncement(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText('New Announcement!'));
  await screen.findByRole('heading', { name: 'Welcome to the club' }, { timeout: 2000 });
}

it('opens from a named keyboard button and keeps dismiss as a separate control', async () => {
  const user = userEvent.setup(); render(<AnnouncementModal />);
  const trigger = screen.getByRole('button', { name: 'Open announcement: Welcome to the club' });
  trigger.focus(); await user.keyboard('{Enter}');
  expect(await screen.findByRole('dialog', { name: 'Welcome to the club' })).toBeInTheDocument();
  expect(h.dismiss).not.toHaveBeenCalled(); expect(h.dismissAsync).not.toHaveBeenCalled();
});

it('portals the dialog outside transformed parents and Escape returns focus to its opener', async () => {
  const user = userEvent.setup(); const view = render(<div style={{ transform: 'translateY(20px)' }}><AnnouncementModal /></div>);
  await openAnnouncement(user);
  const dialog = screen.getByRole('dialog', { name: 'Welcome to the club' });
  expect(view.container.contains(dialog)).toBe(false);
  await user.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByRole('button', { name: 'Open announcement: Welcome to the club' })).toHaveFocus();
  expect(h.dismissAsync).not.toHaveBeenCalled();
});

it('retains the announcement during a failed dismissal and retries the same ID before closing', async () => {
  const user = userEvent.setup(); let reject!: (error: Error) => void;
  h.dismissAsync.mockImplementationOnce(() => new Promise<void>((_resolve, fail) => { reject = fail; }));
  render(<AnnouncementModal />); await openAnnouncement(user);
  await user.click(screen.getByRole('button', { name: 'Dismiss' }));
  expect(screen.getByRole('heading', { name: 'Welcome to the club' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Dismissing/ })).toBeDisabled();
  await act(async () => { reject(new Error('Disconnected')); });
  expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't dismiss/i);
  await user.click(screen.getByRole('button', { name: 'Dismiss' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(h.dismissAsync.mock.calls.map(call => call[0])).toEqual(['welcome', 'welcome']);
});

it('keeps the opened announcement when a newer item arrives', async () => {
  const user = userEvent.setup(); const view = render(<AnnouncementModal />);
  await openAnnouncement(user);
  h.rows = [announcement('newer', 'Newer news'), announcement()]; view.rerender(<AnnouncementModal />);
  expect(screen.getByRole('heading', { name: 'Welcome to the club' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Dismiss' }));
  await waitFor(() => expect(h.dismissAsync).toHaveBeenCalledWith('welcome'));
});

it('retires the open dialog when the owning account session changes', async () => {
  const user = userEvent.setup(); const view = render(<AnnouncementModal />);
  await openAnnouncement(user);
  h.uid = 'bob'; h.profileId = 'profile-bob'; h.epoch++; view.rerender(<AnnouncementModal />);
  expect(screen.queryByRole('heading', { name: 'Welcome to the club' })).not.toBeInTheDocument();
  expect(h.dismissAsync).not.toHaveBeenCalled();
});

it('offers a named retry instead of silently hiding a failed announcement read', async () => {
  h.rows = []; h.isError = true; const user = userEvent.setup(); render(<AnnouncementModal />);
  expect(screen.getByRole('alert')).toHaveTextContent(/couldn't load announcements/i);
  await user.click(screen.getByRole('button', { name: 'Retry announcements' }));
  expect(h.refetch).toHaveBeenCalledOnce();
});
