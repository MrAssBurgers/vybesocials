import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ConnectGame from './ConnectGame';
import { GamePartnerError } from '@/lib/gamePartnerService';

const auth = vi.hoisted(() => ({ id: 'alice', email: 'alice@example.test', profileOwner: 'alice' }));
const api = vi.hoisted(() => ({ get: vi.fn(), approve: vi.fn(), deny: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: auth, profile: { user_id: auth.profileOwner, username: auth.profileOwner } }) }));
vi.mock('@/components/layout/AppLayout', () => ({ AppLayout: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: vi.fn() }));
vi.mock('@/lib/gamePartnerService', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/gamePartnerService')>(),
  getGamePartnerLink: api.get, approveGamePartnerLink: api.approve, denyGamePartnerLink: api.deny,
}));
const request = () => ({ clientId: 'game-1', gameName: 'Moon Race', publisherName: 'Moon Studio', scopes: ['capture:write', 'capture:status'], expiresAt: Date.now() + 600_000, status: 'pending' });
const connection = () => ({ ...request(), connectionId: 'connection-1', createdAt: Date.now(), status: 'active' });
function view(path = '/connect/game?code=ABCD-1234') { return <MemoryRouter initialEntries={[path]}><ConnectGame /></MemoryRouter>; }
async function review() { fireEvent.click(screen.getByRole('button', { name: 'Review request' })); await screen.findByRole('heading', { name: 'Moon Race' }); }
beforeEach(() => {
  vi.clearAllMocks(); auth.id = 'alice'; auth.email = 'alice@example.test'; auth.profileOwner = 'alice';
  api.get.mockImplementation(async () => request()); api.approve.mockImplementation(async () => connection()); api.deny.mockResolvedValue({ ok: true });
});
afterEach(cleanup);

describe('game consent', () => {
  it('requires review and matching-code confirmation before explicit approval', async () => {
    render(view());
    expect(screen.getByLabelText('Code shown in your game')).toHaveValue('ABCD-1234');
    expect(api.get).not.toHaveBeenCalled(); expect(api.approve).not.toHaveBeenCalled();
    await review();
    expect(api.get).toHaveBeenCalledWith('ABCD1234');
    expect(screen.getByText('@alice')).toBeInTheDocument();
    expect(screen.queryByText('alice@example.test')).not.toBeInTheDocument();
    expect(screen.getByText('Published by Moon Studio')).toBeInTheDocument();
    expect(screen.getByText('Send private captures for your review')).toBeInTheDocument();
    const approve = screen.getByRole('button', { name: 'Approve game access' });
    expect(approve).toBeDisabled(); fireEvent.click(approve); expect(api.approve).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(approve); fireEvent.click(approve);
    await screen.findByRole('heading', { name: 'Moon Race is connected' });
    expect(api.approve).toHaveBeenCalledTimes(1); expect(api.approve).toHaveBeenCalledWith('ABCD1234');
    expect(api.deny).not.toHaveBeenCalled();
  });
  it('can deny without approving access', async () => {
    render(view()); await review(); fireEvent.click(screen.getByRole('button', { name: 'Deny request' }));
    await screen.findByRole('heading', { name: 'Request denied' });
    expect(api.deny).toHaveBeenCalledWith('ABCD1234'); expect(api.approve).not.toHaveBeenCalled();
  });
  it.each(['expired', 'approved', 'used', 'denied'])('never offers approval for a %s code', async status => {
    api.get.mockResolvedValueOnce({ ...request(), status, ...(status === 'expired' ? { expiresAt: Date.now() - 1 } : {}) });
    render(view()); await review();
    expect(screen.getByRole('status')).toHaveTextContent(status === 'expired' ? 'This request has expired' : status === 'denied' ? 'This request was denied' : 'This request has already been approved or used');
    expect(screen.queryByRole('button', { name: 'Approve game access' })).not.toBeInTheDocument();
    expect(api.approve).not.toHaveBeenCalled();
  });
  it('does not claim denial succeeded when the server rejects it', async () => {
    api.deny.mockRejectedValueOnce(new GamePartnerError('resource-exhausted', 'rate limit'));
    render(view()); await review(); fireEvent.click(screen.getByRole('button', { name: 'Deny request' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests');
    expect(screen.queryByRole('heading', { name: 'Request denied' })).not.toBeInTheDocument();
    expect(api.approve).not.toHaveBeenCalled();
  });
  it('reports lookup and decision failures without claiming success', async () => {
    api.get.mockRejectedValueOnce(new GamePartnerError('not-found', 'not found'));
    render(view()); fireEvent.click(screen.getByRole('button', { name: 'Review request' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('not found');
    await review();
    api.approve.mockRejectedValueOnce(new GamePartnerError('failed-precondition', 'expired'));
    fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByRole('button', { name: 'Approve game access' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('expired'));
    expect(screen.queryByText('Moon Race is connected')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve game access' })).not.toBeInTheDocument();
  });
  it('clears consent on account switch and ignores the previous account lookup result', async () => {
    let finish: (value: ReturnType<typeof request>) => void = () => {};
    api.get.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const page = render(view()); fireEvent.click(screen.getByRole('button', { name: 'Review request' }));
    auth.id = 'bob'; auth.email = 'bob@example.test'; page.rerender(view());
    await act(async () => finish(request()));
    expect(screen.getByText('b•••@example.test')).toBeInTheDocument();
    expect(screen.queryByText('@alice')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Moon Race' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review request' })).toBeEnabled(); expect(api.approve).not.toHaveBeenCalled();
    await review(); expect(screen.getByRole('checkbox')).not.toBeChecked();
  });
  it('does not display prior account approval completion in a new account', async () => {
    let finish: (value: ReturnType<typeof connection>) => void = () => {};
    api.approve.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const page = render(view()); await review();
    fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByRole('button', { name: 'Approve game access' }));
    auth.id = 'bob'; auth.email = 'bob@example.test'; page.rerender(view());
    await act(async () => finish(connection()));
    expect(screen.queryByText('Moon Race is connected')).not.toBeInTheDocument(); expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
  it('invalidates reviewed consent after editing the public code', async () => {
    render(view()); await review(); fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(screen.getByLabelText('Code shown in your game'), { target: { value: 'DEFG-5678' } });
    expect(screen.queryByRole('button', { name: 'Approve game access' })).not.toBeInTheDocument(); expect(api.approve).not.toHaveBeenCalled();
  });
  it('rejects malformed URL codes without using device secrets or making requests', () => {
    render(view('/connect/game?code=invalid-code&device_code=secret'));
    expect(screen.getByRole('alert')).toHaveTextContent('valid game code');
    expect(screen.getByLabelText('Code shown in your game')).toHaveValue(''); expect(api.get).not.toHaveBeenCalled(); expect(api.approve).not.toHaveBeenCalled();
  });
});
