import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeGallery } from './ThemeGallery';
import type { SharedTheme } from '@/hooks/useSharedThemes';

const mocks = vi.hoisted(() => ({
  uid: 'alice-auth' as string | undefined,
  saved: { data: undefined as { themes: SharedTheme[]; unavailableCount: number } | undefined, isPending: false, isError: false, refetch: vi.fn() },
  own: { data: undefined as SharedTheme[] | undefined, isPending: false, isError: false, refetch: vi.fn() },
  equip: vi.fn(), pending: false, callbacks: [] as Array<() => void>, error: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: mocks.uid ? { id: mocks.uid } : null, profile: mocks.uid ? { id: `${mocks.uid}-profile` } : null }) }));
vi.mock('@/hooks/useSharedThemes', () => ({
  useSavedThemes: () => mocks.saved, useMySharedThemes: () => mocks.own, useUserThemeLikes: () => ({ data: [] }),
  useEquipSharedTheme: () => ({ mutateAsync: mocks.equip, isPending: mocks.pending }),
  useSaveSharedTheme: () => ({ mutate: vi.fn() }), useUnsaveTheme: () => ({ mutate: vi.fn() }),
  useLikeTheme: () => ({ mutate: vi.fn() }), useUnlikeTheme: () => ({ mutate: vi.fn() }),
  useDeleteSharedTheme: () => ({ mutate: vi.fn() }), useUpdateSharedTheme: () => ({ mutate: vi.fn() }),
}));
vi.mock('@/providers/ThemeTransitionProvider', () => ({ useThemeTransition: () => ({ triggerTransition: (_primary: string, _accent: string, callback: () => void) => mocks.callbacks.push(callback) }) }));
vi.mock('sonner', () => ({ toast: { error: mocks.error } }));
const theme = { id: 'violet', creator_id: 'alice-auth-profile', theme_name: 'Violet', theme_tokens: { colorPrimary: '270 80% 50%', mode: 'dark' }, likes_count: 0, downloads_count: 0 } as SharedTheme;
const savedTab = () => fireEvent.mouseDown(screen.getByRole('tab', { name: 'Saved' }), { button: 0, ctrlKey: false });
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); mocks.uid = 'alice-auth'; mocks.pending = false; mocks.callbacks = [];
  mocks.own.data = []; mocks.own.isPending = false; mocks.own.isError = false;
  mocks.saved.data = { themes: [], unavailableCount: 0 }; mocks.saved.isPending = false; mocks.saved.isError = false;
  mocks.equip.mockResolvedValue({ theme });
});
afterEach(cleanup);

describe('theme gallery states and account boundaries', () => {
  it('shows a loading state rather than claiming the owner gallery is empty', () => {
    mocks.own.isPending = true; mocks.own.data = undefined;
    render(<ThemeGallery />);
    expect(screen.getByRole('status', { name: 'Loading themes' })).toBeInTheDocument();
    expect(screen.queryByText("You haven't shared any themes yet")).not.toBeInTheDocument();
  });
  it('shows an error and retry instead of an empty owner gallery', () => {
    mocks.own.isError = true;
    render(<ThemeGallery />);
    expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mocks.own.refetch).toHaveBeenCalledTimes(1);
  });
  it('shows saved-library errors separately from no saved themes', () => {
    mocks.saved.isError = true;
    render(<ThemeGallery />); savedTab();
    expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded');
    expect(screen.queryByText('No saved themes')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mocks.saved.refetch).toHaveBeenCalledTimes(1);
  });
  it('explains unavailable references without claiming the library was never saved', () => {
    mocks.saved.data = { themes: [], unavailableCount: 2 };
    render(<ThemeGallery />); savedTab();
    expect(screen.getByText('2 saved themes are no longer available.')).toBeInTheDocument();
    expect(screen.getByText('No available saved themes')).toBeInTheDocument();
    expect(screen.queryByText('No saved themes')).not.toBeInTheDocument();
  });
  it('renders a readable saved theme and equips through the persistence-aware hook', async () => {
    mocks.saved.data = { themes: [theme], unavailableCount: 0 };
    render(<ThemeGallery />); savedTab();
    fireEvent.click(screen.getByRole('button', { name: 'Equip Violet' }));
    expect(mocks.equip).not.toHaveBeenCalled();
    await act(async () => { mocks.callbacks[0](); });
    expect(mocks.equip).toHaveBeenCalledWith(theme);
    expect(screen.getByText('✓ Active')).toBeInTheDocument();
  });
  it('does not mark the theme active after equip persistence fails', async () => {
    mocks.own.data = [theme]; mocks.equip.mockRejectedValue(new Error('Save failed'));
    render(<ThemeGallery />);
    fireEvent.click(screen.getByRole('button', { name: 'Equip Violet' }));
    await act(async () => { mocks.callbacks[0](); });
    expect(screen.queryByText('✓ Active')).not.toBeInTheDocument();
  });
  it('drops a delayed transition after switching accounts, including switching back', async () => {
    mocks.own.data = [theme];
    const view = render(<ThemeGallery />);
    fireEvent.click(screen.getByRole('button', { name: 'Equip Violet' }));
    mocks.uid = 'bob-auth'; view.rerender(<ThemeGallery />);
    mocks.uid = 'alice-auth'; view.rerender(<ThemeGallery />);
    await act(async () => { mocks.callbacks[0](); });
    expect(mocks.equip).not.toHaveBeenCalled();
  });
  it('never uses another account global equipped-ID indicator', () => {
    localStorage.setItem('vybe-equipped-theme-id', theme.id); mocks.own.data = [theme];
    render(<ThemeGallery />);
    expect(screen.queryByText('✓ Active')).not.toBeInTheDocument();
  });
  it('shows sign-in state instead of a private gallery after sign-out', () => {
    mocks.uid = undefined; mocks.own.data = [theme];
    render(<ThemeGallery />);
    expect(screen.getByText('Sign in to view your themes.')).toBeInTheDocument();
    expect(screen.queryByText('Violet')).not.toBeInTheDocument();
  });
});
