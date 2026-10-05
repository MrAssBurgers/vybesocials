import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MapSnapTopBar } from './MapSnapTopBar';
afterEach(cleanup);
function held() { let resolve!: (value: boolean) => void; const promise = new Promise<boolean>(r => { resolve = r; }); return { promise, resolve }; }
const props = () => ({ onBack: vi.fn(), onSearch: vi.fn(async () => false), onCancelSearch: vi.fn(), onOpenSettings: vi.fn() });
const open = () => fireEvent.click(screen.getByRole('button', { name: 'Search map places' }));
describe('map search editor', () => {
  it('keeps the query editable after a failed search and closes only after success', async () => {
    const value = props(); const { rerender } = render(<MapSnapTopBar {...value} />); open();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search map places' }), { target: { value: 'Chicago' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Go', exact: true })));
    rerender(<MapSnapTopBar {...value} searchError="Service unavailable. Retry." />);
    expect(screen.getByRole('textbox')).toHaveValue('Chicago'); expect(screen.getByRole('status')).toHaveTextContent('Retry');
    value.onSearch.mockResolvedValue(true); await act(async () => fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' }));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
  it('does not close an edited query when an earlier search later succeeds', async () => {
    const value = props(), pending = held(); value.onSearch.mockReturnValueOnce(pending.promise); render(<MapSnapTopBar {...value} />); open();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'First' } }); fireEvent.click(screen.getByRole('button', { name: 'Go', exact: true }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Second' } });
    await act(async () => { pending.resolve(true); await pending.promise; }); expect(screen.getByRole('textbox')).toHaveValue('Second'); expect(value.onCancelSearch).toHaveBeenCalledTimes(2);
  });
  it('cancels through Escape and the close control and prevents duplicate pending submissions', async () => {
    const value = props(); const { rerender } = render(<MapSnapTopBar {...value} />); open();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Place' } }); rerender(<MapSnapTopBar {...value} searchPending />);
    expect(screen.getByRole('button', { name: 'Searching…' })).toBeDisabled(); fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' }); expect(value.onSearch).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' }); expect(screen.queryByRole('textbox')).not.toBeInTheDocument(); open();
    fireEvent.click(screen.getByRole('button', { name: 'Close map search' })); expect(screen.queryByRole('textbox')).not.toBeInTheDocument(); expect(value.onCancelSearch).toHaveBeenCalledTimes(3);
  });
});
