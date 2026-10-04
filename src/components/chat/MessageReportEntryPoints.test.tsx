import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MessageActionMenu } from './MessageActionMenu';
import { DMHoldMenu } from './DMHoldMenu';
import { ReportContentDialog } from '@/components/safety/ReportContentDialog';

vi.mock('@/lib/haptics', () => ({ triggerHaptic: vi.fn() }));
vi.mock('@/lib/frequentEmojis', () => ({ getTopEmojis: () => ['👍'] }));
const nothing = () => {};
function Harness({ mobile = false }: { mobile?: boolean }) {
  const [menu, setMenu] = useState(true);
  const [report, setReport] = useState(false);
  return <>
    {mobile ? <DMHoldMenu open={menu} onClose={() => setMenu(false)} isOwn={false} onReaction={nothing} onReply={nothing} onReport={() => setReport(true)} />
      : <MessageActionMenu messageId="selected-message" isOwn={false} isTextMessage onReply={nothing} onDeleteForMe={nothing} onUnsendForEveryone={nothing} onReport={() => setReport(true)} />}
    <ReportContentDialog open={report} onOpenChange={setReport} title="Report selected message" onSubmit={async () => { throw new Error('Retry'); }} />
  </>;
}
afterEach(cleanup);

describe('message report menu propagation', () => {
  it('desktop menu opens a report dialog that remains open after the menu closes and submit fails', async () => {
    render(<Harness />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Message actions' }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Report' }));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Report selected message');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Spam', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit Report' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t submit');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Spam', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });
  it('touch hold menu opens the report reason picker while closing only the action menu', async () => {
    render(<Harness mobile />);
    fireEvent.click(screen.getByRole('button', { name: 'Report message' }));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Report selected message');
    expect(screen.getByRole('button', { name: 'Submit Report' })).toBeDisabled();
  });
  it('does not expose a dead desktop report item without a report callback', async () => {
    render(<MessageActionMenu messageId="m" isOwn={false} isTextMessage onReply={nothing} onDeleteForMe={nothing} onUnsendForEveryone={nothing} />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Message actions' }), { key: 'Enter' });
    await screen.findByRole('menu');
    expect(screen.queryByRole('menuitem', { name: 'Report' })).not.toBeInTheDocument();
  });
});
