import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateMenuLayer, type CreateMenuView } from './CreateMenuLayer';
import { CreateMenu } from './CreateMenu';
import { BottomNav } from '@/components/layout/BottomNav';

const mock = vi.hoisted(() => {
  const session = { uid: 'alice' as string | undefined, epoch: 1 };
  return {
    session, native: session, user: { id: 'alice' } as { id: string } | null,
    profile: { user_id: 'alice' }, role: 'user', reducedMotion: true,
    navigate: vi.fn(), openCamera: vi.fn(), camera: vi.fn(), haptic: vi.fn(), sound: vi.fn(),
  };
});
vi.mock('react-router-dom', async original => ({ ...await original<typeof import('react-router-dom')>(), useNavigate: () => mock.navigate }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: mock.user, profile: mock.profile }) }));
vi.mock('@/hooks/useModeration', () => ({ useUserRole: () => ({ data: mock.role }) }));
vi.mock('@/lib/theme', () => ({ useTheme: () => ({ reducedMotion: mock.reducedMotion }) }));
vi.mock('@/hooks/useReportAccountSession', () => ({ useReportAccountSession: () => mock.session }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountSnapshot: () => mock.native }));
vi.mock('@/contexts/cameraOverlaySafe', () => ({ useCameraOverlayOptional: () => ({ openCamera: mock.openCamera }) }));
vi.mock('@/contexts/cameraOverlayActions', () => ({ openSnapCamera: mock.camera }));
vi.mock('@/lib/haptics', () => ({ triggerHaptic: mock.haptic }));
vi.mock('@/lib/sounds', () => ({ playSound: mock.sound }));
vi.mock('@/lib/navFeedback', () => ({ triggerNavFeedback: vi.fn() }));
vi.mock('@/hooks/useMessages', () => ({ useUnreadMessagesCount: () => ({ data: 0 }) }));
vi.mock('@/hooks/useUserPreferences', () => ({ useUserPreferences: () => ({ data: {} }), useUpdatePreferences: () => ({ mutate: vi.fn() }) }));
vi.mock('@/lib/routePreloader', () => ({ preloadRoute: vi.fn() }));
vi.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AvatarFallback: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  ProfileAvatarImage: () => null,
}));

function Harness({ initialView = 'create', legacy = false }: { initialView?: CreateMenuView; legacy?: boolean }) {
  const [open, setOpen] = useState(false);
  return <MemoryRouter><button onClick={() => setOpen(true)}>Open Create</button><button>Background action</button>
    {legacy ? <CreateMenu isOpen={open} onClose={() => setOpen(false)} /> : <CreateMenuLayer open={open} initialView={initialView} onOpenChange={setOpen} />}
  </MemoryRouter>;
}
const open = async (initialView?: CreateMenuView) => {
  const user = userEvent.setup(); const view = render(<Harness initialView={initialView} />);
  const trigger = screen.getByRole('button', { name: 'Open Create' });
  await user.click(trigger);
  const dialog = await screen.findByRole('dialog');
  return { user, trigger, dialog, ...view };
};
beforeEach(() => {
  vi.clearAllMocks(); mock.user = { id: 'alice' }; mock.profile = { user_id: 'alice' }; mock.role = 'user'; mock.reducedMotion = true;
  mock.session = { uid: 'alice', epoch: mock.session.epoch + 1 }; mock.native = mock.session;
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('Create dialog keyboard and lifecycle behavior', () => {
  it('announces its heading, focuses inside, traps Tab in both directions and restores its opener on Escape', async () => {
    const { user, trigger, dialog } = await open();
    expect(dialog).toHaveAccessibleName('Create');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('Choose what to create or explore. Escape closes this menu.');
    expect(screen.getByRole('heading', { name: 'Create' })).toHaveFocus();
    const buttons = within(dialog).getAllByRole('button');
    buttons.at(-1)!.focus(); await user.tab(); expect(buttons[0]).toHaveFocus();
    await user.tab({ shift: true }); expect(buttons.at(-1)).toHaveFocus();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(mock.navigate).not.toHaveBeenCalled();
  });

  it('moves focus to the new view heading and keeps every view dismissible', async () => {
    const { user } = await open();
    await user.click(screen.getByRole('button', { name: /^Hub$/ }));
    const hub = await screen.findByRole('dialog', { name: 'VYBE Hub' });
    await within(hub).findByRole('button', { name: /Mini Apps/ });
    expect(screen.getByRole('heading', { name: 'VYBE Hub' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Back to Create' }));
    await screen.findByRole('button', { name: /^Utilities$/ });
    await user.click(screen.getByRole('button', { name: /^Utilities$/ }));
    await screen.findByRole('button', { name: /Creator Analytics/ });
    expect(screen.getByRole('heading', { name: 'Utilities' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Close create menu' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('closes on backdrop pointer input without activating the background', async () => {
    const { user } = await open();
    const backdrop = document.querySelector('[data-create-backdrop]')!;
    await user.click(backdrop);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(mock.navigate).not.toHaveBeenCalled(); expect(mock.camera).not.toHaveBeenCalled();
  });

  it('has no delayed reset that overwrites a freshly reopened Hub', async () => {
    const view = render(<MemoryRouter><CreateMenuLayer open initialView="create" onOpenChange={vi.fn()} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Close create menu' }));
    view.rerender(<MemoryRouter><CreateMenuLayer open={false} initialView="create" onOpenChange={vi.fn()} /></MemoryRouter>);
    view.rerender(<MemoryRouter><CreateMenuLayer open initialView="hub" onOpenChange={vi.fn()} /></MemoryRouter>);
    await screen.findByRole('button', { name: /Mini Apps/ });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 250)); });
    expect(screen.getByRole('dialog')).toHaveAccessibleName('VYBE Hub');
  });

  it('marks outgoing pages inert and refuses their obsolete navigation events', async () => {
    mock.reducedMotion = false;
    await open();
    const post = screen.getByRole('button', { name: /^Post$/ });
    fireEvent.click(screen.getByRole('button', { name: /^Hub$/ }));
    expect(post.closest('[inert]')).not.toBeNull();
    fireEvent.click(post);
    expect(mock.navigate).not.toHaveBeenCalled();
    const mini = await screen.findByRole('button', { name: /Mini Apps/ });
    fireEvent.click(mini); fireEvent.click(mini);
    expect(mock.navigate).toHaveBeenCalledTimes(1); expect(mock.navigate).toHaveBeenCalledWith('/mini-apps');
  });

  it('does not add transform motion under the in-app reduced motion preference', async () => {
    const { dialog, rerender } = await open();
    expect(dialog.style.transform).not.toMatch(/scale\(0|translateY\((?!0)/);
    expect(screen.getByRole('button', { name: /^Post$/ }).innerHTML).not.toContain('group-hover:scale-105');
    mock.reducedMotion = false; rerender(<Harness />);
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Create');
    mock.reducedMotion = true; rerender(<Harness />);
    expect(screen.getByRole('button', { name: /^Post$/ }).innerHTML).not.toContain('group-hover:scale-105');
  });

  it('uses the same accessible flow for the legacy CreateMenu entry point', async () => {
    render(<Harness legacy />); fireEvent.click(screen.getByRole('button', { name: 'Open Create' }));
    expect(await screen.findByRole('dialog', { name: 'Create' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Hub$/ }));
    expect(await screen.findByRole('button', { name: /Mini Apps/ })).toBeInTheDocument();
  });
});

describe('Create dialog actions stay with their opening account', () => {
  it('opens normal post creation once and acquires camera only from its deliberate action', async () => {
    const first = await open();
    expect(mock.camera).not.toHaveBeenCalled();
    await first.user.click(screen.getByRole('button', { name: /^Post$/ }));
    expect(mock.navigate).toHaveBeenCalledWith('/upload');
    first.unmount();
    const second = await open();
    await second.user.click(screen.getByRole('button', { name: /^Camera$/ }));
    expect(mock.camera).toHaveBeenCalledOnce(); expect(mock.camera).toHaveBeenCalledWith(mock.openCamera, { source: 'global' });
  });

  it('routes guests to sign in and never invokes their camera', async () => {
    mock.user = null; mock.session = { uid: undefined, epoch: mock.session.epoch + 1 }; mock.native = mock.session;
    const { user } = await open();
    await user.click(screen.getByRole('button', { name: /^Camera$/ }));
    expect(mock.navigate).toHaveBeenCalledWith('/login'); expect(mock.camera).not.toHaveBeenCalled();
  });

  it('refuses a stale click before React catches up to an account change, including ABA', async () => {
    const { dialog } = await open();
    mock.native = { uid: 'alice', epoch: mock.session.epoch + 2 };
    fireEvent.click(within(dialog).getByRole('button', { name: /^Post$/ }));
    expect(mock.navigate).not.toHaveBeenCalled(); expect(mock.camera).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('closes an open menu when the account changes and hides stale profile staff links', async () => {
    mock.role = 'admin'; const view = await open('hub');
    expect(await screen.findByRole('button', { name: /Admin Panel/ })).toBeInTheDocument();
    mock.user = { id: 'bob' }; mock.session = { uid: 'bob', epoch: mock.session.epoch + 1 }; mock.native = mock.session;
    view.rerender(<Harness initialView="hub" />);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Open Create' }));
    await screen.findByRole('button', { name: /Mini Apps/ });
    expect(screen.queryByRole('button', { name: /Admin Panel/ })).toBeNull();
  });
});

describe('bottom Create button integration', () => {
  it('opens by keyboard, restores the trigger on Escape and preserves its randomized bubble seed', async () => {
    render(<MemoryRouter><BottomNav /></MemoryRouter>);
    const user = userEvent.setup(); const trigger = screen.getByRole('button', { name: 'Create' });
    const seedStyle = trigger.getAttribute('style');
    trigger.focus(); await user.keyboard('{Enter}');
    const dialog = await screen.findByRole('dialog', { name: 'Create' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog'); expect(trigger).toHaveAttribute('aria-controls', dialog.id);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(trigger.getAttribute('style')).toBe(seedStyle);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('routes the existing double-tap and tutorial Hub actions into the live menu', async () => {
    render(<MemoryRouter><BottomNav /></MemoryRouter>);
    const trigger = screen.getByRole('button', { name: 'Create' });
    fireEvent.click(trigger); fireEvent.click(trigger);
    expect(await screen.findByRole('dialog', { name: 'VYBE Hub' })).toBeInTheDocument();
    await screen.findByRole('button', { name: 'Mini Apps' });
    act(() => window.dispatchEvent(new Event('tutorial-close-menus')));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    act(() => window.dispatchEvent(new Event('tutorial-open-vybe-hub')));
    expect(await screen.findByRole('dialog', { name: 'VYBE Hub' })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Mini Apps' }));
    expect(mock.navigate).toHaveBeenCalledWith('/mini-apps');
  });

  it('preserves long-press navigation editing without accidentally opening Create', async () => {
    vi.useFakeTimers(); render(<MemoryRouter><BottomNav /></MemoryRouter>);
    const trigger = screen.getByRole('button', { name: 'Create' });
    fireEvent.touchStart(trigger);
    await act(() => vi.advanceTimersByTimeAsync(650));
    fireEvent.touchEnd(trigger); fireEvent.click(trigger);
    expect(screen.getByRole('button', { name: 'Finish editing navigation' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(trigger);
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
