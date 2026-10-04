import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReportContentDialog } from './ReportContentDialog';
vi.mock('@/lib/haptics', () => ({ triggerHaptic: vi.fn() }));
afterEach(cleanup);
describe('shared report confirmation lifetime', () => {
  it('prevents duplicate submission and prevents closing a pending report', async () => {
    let resolve!: () => void;
    const onSubmit = vi.fn(() => new Promise<void>(done => { resolve = done; }));
    const onOpenChange = vi.fn();
    render(<ReportContentDialog open title="Report post" onOpenChange={onOpenChange} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Spam' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit Report' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submitting…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
    expect(onSubmit).toHaveBeenCalledTimes(1); expect(onOpenChange).not.toHaveBeenCalled();
    await act(async () => { resolve(); });
    expect(onOpenChange).toHaveBeenCalledOnce(); expect(onOpenChange).toHaveBeenCalledWith(false);
  });
  it('never closes a new form after the old target was unmounted', async () => {
    let resolve!: () => void;
    const onOpenChange = vi.fn();
    const onSubmit = vi.fn(() => new Promise<void>(done => { resolve = done; }));
    const { rerender } = render(<ReportContentDialog key="alice:post1" open title="Report post" onOpenChange={onOpenChange} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Spam' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit Report' }));
    rerender(<ReportContentDialog key="bob:post2" open title="Report post" onOpenChange={onOpenChange} onSubmit={onSubmit} />);
    expect(screen.getByRole('button', { name: 'Spam' })).toHaveAttribute('aria-pressed', 'false');
    await act(async () => { resolve(); });
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });
});
