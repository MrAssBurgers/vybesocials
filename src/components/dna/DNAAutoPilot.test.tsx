import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ value: {} as Record<string, unknown>, apply: vi.fn(), undo: vi.fn(), refresh: vi.fn() }));
vi.mock('@/hooks/useDNAAutoPilot', () => ({ useDNAAutoPilot: () => mock.value }));
import { DNAAutoPilot } from './DNAAutoPilot';
const draft = { id: 'a', action_type: 'layout_change', summary: 'Use larger text', created_at: '2026-10-04', applied: false, reverted: false, phase: 'suggested', change: { type: 'layout_change', patch: { fontScale: 'large' } } };
beforeEach(() => { vi.clearAllMocks(); mock.value = { settings: { mode: 'suggest' }, actions: [draft], loading: false, loadError: null, busy: null, applyPending: mock.apply, revert: mock.undo, refresh: mock.refresh, setMode: vi.fn(), runNow: vi.fn() }; });
afterEach(cleanup);
const show = () => render(<MemoryRouter><DNAAutoPilot /></MemoryRouter>);
it('offers reachable Apply with exact supported settings, and Undo after confirmed apply', () => {
  const page = show(); expect(screen.getByText('font scale: large')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Apply' })); expect(mock.apply).toHaveBeenCalledWith('a');
  mock.value = { ...mock.value, actions: [{ ...draft, phase: 'applied', applied: true }] }; page.rerender(<MemoryRouter><DNAAutoPilot /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Undo' })); expect(mock.undo).toHaveBeenCalledWith('a');
});
it('does not offer fake Apply for legacy informational rows', () => {
  mock.value.actions = [{ ...draft, phase: 'informational', change: null }]; show();
  expect(screen.queryByRole('button', { name: 'Apply' })).not.toBeInTheDocument(); expect(screen.getByText(/idea only/)).toBeInTheDocument();
});
it('retains actionable mutation errors and blocks duplicate controls while saving', () => {
  mock.value = { ...mock.value, busy: 'a', operationError: 'Your newer choices were preserved.' }; show();
  expect(screen.getByRole('alert')).toHaveTextContent('Your newer choices were preserved.'); expect(screen.getByRole('button', { name: 'Applying…' })).toBeDisabled();
});
it('hides old plans behind a failed current read and provides Retry', () => {
  mock.value.loadError = 'Service unavailable'; show(); expect(screen.queryByRole('button', { name: 'Apply' })).not.toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: 'Retry' })); expect(mock.refresh).toHaveBeenCalled();
});
