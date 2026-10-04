import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameConnectionsSection } from './GameConnectionsSection';
import { GamePartnerError } from '@/lib/gamePartnerService';

const auth = vi.hoisted(() => ({ id: 'alice' }));
const api = vi.hoisted(() => ({ list: vi.fn(), revoke: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: auth }) }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: vi.fn() }));
vi.mock('@/lib/gamePartnerService', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/gamePartnerService')>(),
  listGamePartnerConnections: api.list, revokeGamePartnerConnection: api.revoke,
}));
const connection = () => ({ clientId: 'game-1', connectionId: 'connection-1', gameName: 'Moon Race', publisherName: 'Moon Studio', scopes: ['capture:write', 'capture:status'], createdAt: Date.now(), expiresAt: Date.now() + 600_000, status: 'active' });
function view() { return <MemoryRouter><GameConnectionsSection /></MemoryRouter>; }
beforeEach(() => { vi.clearAllMocks(); auth.id = 'alice'; api.list.mockImplementation(async () => [connection()]); api.revoke.mockResolvedValue({ ok: true }); });
afterEach(cleanup);

describe('connected game controls', () => {
  it('requires confirmation, preserves access on cancel, and shows successful revocation immediately', async () => {
    render(view()); await screen.findByText('Moon Race');
    fireEvent.click(screen.getByRole('button', { name: 'Revoke access for Moon Race' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('published posts stay on VYBE'); expect(api.revoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep access' })); expect(api.revoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Revoke access for Moon Race' })); fireEvent.click(screen.getByRole('button', { name: 'Revoke game access' }));
    await screen.findByText('Access revoked'); expect(api.revoke).toHaveBeenCalledTimes(1); expect(api.revoke).toHaveBeenCalledWith('connection-1');
    expect(screen.queryByRole('button', { name: 'Revoke access for Moon Race' })).not.toBeInTheDocument();
  });
  it('keeps access visible and the dialog open after a revoke error', async () => {
    api.revoke.mockRejectedValueOnce(new GamePartnerError('resource-exhausted', 'rate limit'));
    render(view()); await screen.findByText('Moon Race');
    fireEvent.click(screen.getByRole('button', { name: 'Revoke access for Moon Race' })); fireEvent.click(screen.getByRole('button', { name: 'Revoke game access' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument(); expect(screen.queryByText('Access revoked')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revoke game access' })).toBeEnabled();
  });
  it('distinguishes a failed list request from an empty connection list and supports retry', async () => {
    api.list.mockRejectedValueOnce(new Error('offline'));
    render(view()); await screen.findByRole('alert'); expect(screen.queryByText('No games connected yet.')).not.toBeInTheDocument();
    api.list.mockResolvedValueOnce([]); fireEvent.click(screen.getByRole('button', { name: 'Refresh games' }));
    await screen.findByText('No games connected yet.'); expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('drops the previous account list and ignores its late result after switching accounts', async () => {
    let finish: (value: ReturnType<typeof connection>[]) => void = () => {};
    api.list.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const page = render(view()); auth.id = 'bob'; api.list.mockResolvedValueOnce([]); page.rerender(view());
    await screen.findByText('No games connected yet.'); await act(async () => finish([connection()]));
    expect(screen.queryByText('Moon Race')).not.toBeInTheDocument(); expect(api.revoke).not.toHaveBeenCalled();
  });
  it('closes a pending revocation dialog and ignores success after account switch', async () => {
    let finish: (value: { ok: true }) => void = () => {};
    api.revoke.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const page = render(view()); await screen.findByText('Moon Race');
    fireEvent.click(screen.getByRole('button', { name: 'Revoke access for Moon Race' })); fireEvent.click(screen.getByRole('button', { name: 'Revoke game access' }));
    auth.id = 'bob'; api.list.mockResolvedValueOnce([]); page.rerender(view());
    await act(async () => finish({ ok: true }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.queryByText('Access revoked for Moon Race.')).not.toBeInTheDocument(); expect(screen.queryByText('Moon Race')).not.toBeInTheDocument();
  });
  it('shows expired access without an active grant action', async () => {
    api.list.mockResolvedValueOnce([{ ...connection(), expiresAt: Date.now() - 1 }]);
    render(view()); await screen.findByText('Access expired');
    expect(screen.queryByRole('button', { name: 'Revoke access for Moon Race' })).not.toBeInTheDocument();
  });
});
