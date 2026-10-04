import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './dialog';
import { EnablePushPrompt } from '@/components/notifications/EnablePushPrompt';

const push = vi.hoisted(() => ({ open: true, onEnable: vi.fn(), onDismiss: vi.fn(), isLoading: false }));
vi.mock('@/hooks/useEnablePushPrompt', () => ({ useEnablePushPrompt: () => push }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function NestedHeading() {
  return <DialogHeader><DialogTitle>Choose your appearance</DialogTitle><DialogDescription>Change colors and feedback.</DialogDescription></DialogHeader>;
}

describe('shared dialog accessible names', () => {
  it('announces the push prompt by its actual heading with one unique title target', () => {
    render(<EnablePushPrompt />);
    const dialog = screen.getByRole('dialog', { name: 'Turn on notifications' });
    const title = screen.getByRole('heading', { name: 'Turn on notifications' });
    expect(dialog).toHaveAttribute('aria-labelledby', title.id);
    expect(document.querySelectorAll(`[id="${title.id}"]`)).toHaveLength(1);
    expect(screen.queryByRole('heading', { name: 'Dialog' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(push.onDismiss).toHaveBeenCalledOnce();
  });

  it('uses titles rendered through nested components without injecting a fallback', () => {
    render(<Dialog defaultOpen><DialogContent><NestedHeading /></DialogContent></Dialog>);
    const dialog = screen.getByRole('dialog', { name: 'Choose your appearance' });
    expect(dialog).toHaveAccessibleDescription('Change colors and feedback.');
    expect(screen.getAllByRole('heading')).toHaveLength(1);
  });

  it('preserves explicit title IDs and the existing dismissal policy', () => {
    render(<Dialog defaultOpen><DialogTrigger>Open</DialogTrigger><DialogContent aria-labelledby="custom-appearance-title"><DialogTitle id="custom-appearance-title">Custom appearance</DialogTitle><DialogDescription>Configure your view.</DialogDescription></DialogContent></Dialog>);
    const dialog = screen.getByRole('dialog', { name: 'Custom appearance' });
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(dialog).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps separate dialogs attached to separate generated title IDs', () => {
    render(<>
      <Dialog open modal={false}><DialogContent><DialogTitle>First settings</DialogTitle><DialogDescription>First choices.</DialogDescription></DialogContent></Dialog>
      <Dialog open modal={false}><DialogContent><DialogTitle>Second settings</DialogTitle><DialogDescription>Second choices.</DialogDescription></DialogContent></Dialog>
    </>);
    const first = screen.getByRole('dialog', { name: 'First settings' });
    const second = screen.getByRole('dialog', { name: 'Second settings' });
    expect(first.getAttribute('aria-labelledby')).not.toBe(second.getAttribute('aria-labelledby'));
    for (const dialog of [first, second]) expect(document.querySelectorAll(`[id="${dialog.getAttribute('aria-labelledby')}"]`)).toHaveLength(1);
  });
});
