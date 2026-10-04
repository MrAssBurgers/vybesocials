import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  actor: { uid: 'alice', profileId: 'alice-profile', epoch: 1 },
  query: { data: [] as unknown[], isError: false, isLoading: false, isFetching: false, refetch: vi.fn() },
  importCode: vi.fn(), equip: vi.fn(), importPending: false, equipPending: false,
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: mock.actor.uid }, profile: { id: mock.actor.profileId, user_id: mock.actor.uid } }) }));
vi.mock('@/hooks/useThemeActor', () => ({ useThemeActor: () => ({ actor: mock.actor }) }));
vi.mock('@/hooks/useSharedThemes', () => ({
  usePublicThemes: () => mock.query,
  useEquipSharedTheme: () => ({ mutateAsync: mock.equip, isPending: mock.equipPending }),
  useLikeTheme: () => ({ mutate: vi.fn() }), useUnlikeTheme: () => ({ mutate: vi.fn() }),
  useUserThemeLikes: () => ({ data: [] }), useDeleteSharedTheme: () => ({ mutate: vi.fn() }),
}));
vi.mock('@/hooks/useUISettings', () => ({ useImportThemeCode: () => ({ mutateAsync: mock.importCode, isPending: mock.importPending }) }));
vi.mock('@/components/ui/VybeMiniIcon', () => ({ VybeMiniIcon: () => <svg /> }));
import { ThemeMarketplace } from './ThemeMarketplace';
// Auth hooks below are fixtures without context subscriptions. Bypassing only
// the memo wrapper lets rerender model an actual auth-context notification.
const Marketplace = (ThemeMarketplace as unknown as { type: () => JSX.Element }).type;
const theme = { id: 'imported-theme', theme_name: 'Imported theme', theme_tokens: { colorPrimary: '270 80% 50%' } };
const codePlaceholder = 'Enter theme code (e.g., ABC12345)';
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function startImport() {
  fireEvent.click(screen.getByRole('button', { name: 'Import' }));
  fireEvent.change(screen.getByPlaceholderText(codePlaceholder), { target: { value: 'ABCD1234' } });
  fireEvent.click(screen.getByRole('button', { name: 'Import Theme' }));
}
beforeEach(() => {
  vi.clearAllMocks(); mock.actor = { uid: 'alice', profileId: 'alice-profile', epoch: mock.actor.epoch + 1 };
  mock.query = { data: [], isError: false, isLoading: false, isFetching: false, refetch: vi.fn() };
  mock.importPending = false; mock.equipPending = false;
  mock.importCode.mockResolvedValue(theme); mock.equip.mockResolvedValue(theme);
});
afterEach(cleanup);

describe('theme marketplace confirmed outcomes', () => {
  it.each(['Neon', 'Minimal', 'Glass', 'Vibrant'])('filters the %s category using the saved category or tags', category => {
    mock.query.data = [{ ...theme, id: 'matching', theme_name: 'Matching theme', tags: [category.toLowerCase()] },
      { ...theme, id: 'other', theme_name: 'Other theme', category: 'unrelated' }];
    render(<Marketplace />);
    fireEvent.click(screen.getByRole('button', { name: category, exact: true }));
    expect(screen.getByText('Matching theme')).toBeInTheDocument();
    expect(screen.queryByText('Other theme')).not.toBeInTheDocument();
  });
  it('shows retry for a failed list read instead of a false empty gallery', () => {
    mock.query.isError = true; render(<Marketplace />);
    expect(screen.getByText('Could not load themes.')).toBeInTheDocument();
    expect(screen.queryByText('No themes found')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' })); expect(mock.query.refetch).toHaveBeenCalledTimes(1);
  });

  it('waits for confirmed equip before closing the import dialog', async () => {
    const imported = deferred<unknown>(), equipped = deferred<unknown>();
    mock.importCode.mockReturnValue(imported.promise); mock.equip.mockReturnValue(equipped.promise);
    render(<Marketplace />); startImport();
    expect(mock.importCode).toHaveBeenCalledWith('ABCD1234'); expect(mock.equip).not.toHaveBeenCalled();
    await act(async () => { imported.resolve(theme); });
    expect(mock.equip).toHaveBeenCalledWith(theme);
    expect(screen.getByPlaceholderText(codePlaceholder)).toHaveValue('ABCD1234');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await act(async () => { equipped.resolve(theme); });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it.each(['import', 'equip'])('preserves the entered code after %s fails', async stage => {
    if (stage === 'import') mock.importCode.mockRejectedValue(new Error('Code could not be read'));
    else mock.equip.mockRejectedValue(new Error('Theme could not be saved'));
    render(<Marketplace />); startImport();
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByPlaceholderText(codePlaceholder)).toHaveValue('ABCD1234');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    if (stage === 'import') expect(mock.equip).not.toHaveBeenCalled();
  });

  it('clears the private code on account changes and suppresses an old import completion', async () => {
    const imported = deferred<unknown>(); mock.importCode.mockReturnValue(imported.promise);
    const view = render(<Marketplace />); startImport();
    mock.actor = { uid: 'bob', profileId: 'bob-profile', epoch: mock.actor.epoch + 1 };
    view.rerender(<Marketplace />);
    await act(async () => { imported.resolve(theme); });
    expect(mock.equip).not.toHaveBeenCalled(); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(screen.getByPlaceholderText(codePlaceholder)).toHaveValue('');
  });

  it('clears the previous login code even when a new session has the same UID', () => {
    const view = render(<Marketplace />);
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    fireEvent.change(screen.getByPlaceholderText(codePlaceholder), { target: { value: 'ABCD1234' } });
    mock.actor = { ...mock.actor, epoch: mock.actor.epoch + 1 };
    view.rerender(<Marketplace />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(screen.getByPlaceholderText(codePlaceholder)).toHaveValue('');
  });
});
