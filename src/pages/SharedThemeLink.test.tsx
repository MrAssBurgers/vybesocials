import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
const mock = vi.hoisted(() => ({
  auth: { user: { id: 'alice' } as { id: string } | null, profile: { id: 'alice-profile', user_id: 'alice' } as { id: string; user_id: string } | null, loading: false },
  query: { data: null as unknown, isLoading: false, isFetching: false, isError: false, isPending: false, refetch: vi.fn() },
  stash: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => mock.auth }));
vi.mock('@/hooks/useThemeActor', () => ({ useThemeActor: () => ({ actor: mock.auth.user && mock.auth.profile ? { uid: mock.auth.user.id, profileId: mock.auth.profile.id, epoch: 1 } : null }) }));
vi.mock('@/hooks/useSharedThemes', () => ({ useSharedThemeById: () => mock.query }));
vi.mock('@/lib/authReturnPath', () => ({ stashAuthReturnPath: mock.stash }));
vi.mock('@/components/themes/ReceivedThemeSheet', () => ({ ReceivedThemeSheet: ({ theme }: { theme: { theme_name: string } }) => <div>Preview: {theme.theme_name}</div> }));
import SharedThemeLink from './SharedThemeLink';
function mount() {
  return render(<MemoryRouter initialEntries={['/theme/secret-theme']}><Routes><Route path="/theme/:id" element={<SharedThemeLink />} /><Route path="/login" element={<div>Sign-in page</div>} /></Routes></MemoryRouter>);
}
beforeEach(() => {
  vi.clearAllMocks(); mock.auth = { user: { id: 'alice' }, profile: { id: 'alice-profile', user_id: 'alice' }, loading: false };
  mock.query = { data: null, isLoading: false, isFetching: false, isError: false, isPending: false, refetch: vi.fn() };
});
afterEach(cleanup);
describe('theme-link admission UI', () => {
  it('shows a retryable read failure without calling the theme missing', () => {
    mock.query.isError = true; mount();
    expect(screen.getByRole('heading', { name: 'Could not load this theme' })).toBeInTheDocument();
    expect(screen.queryByText('Theme not found')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' })); expect(mock.query.refetch).toHaveBeenCalledTimes(1);
  });
  it('reserves not-found for a completed admitted read with no theme', () => {
    mount(); expect(screen.getByText('Theme not found')).toBeInTheDocument();
  });
  it('does not report not-found while the signed-in profile is still resolving', () => {
    mock.auth.profile = null; mock.query.data = undefined; mock.query.isPending = true; mount();
    expect(screen.queryByText('Theme not found')).not.toBeInTheDocument();
    expect(screen.getByText(/Loading theme|Loading your profile|Preparing your account/)).toBeInTheDocument();
  });
  it('requires sign-in and preserves the requested theme return path', () => {
    mock.auth.user = null; mock.auth.profile = null; mount();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(mock.stash).toHaveBeenCalledWith('/theme/secret-theme'); expect(screen.getByText('Sign-in page')).toBeInTheDocument();
  });
  it('renders only the freshly admitted theme after loading completes', () => {
    mock.query.data = { theme_name: 'Allowed theme' }; mount();
    expect(screen.getByText('Preview: Allowed theme')).toBeInTheDocument();
    expect(document.title).toBe('Allowed theme · VYBE Theme');
  });
});
