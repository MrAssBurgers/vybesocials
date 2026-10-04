import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DMHoldMenu } from './DMHoldMenu';
vi.mock('@/lib/frequentEmojis', () => ({ getTopEmojis: () => ['👍'] }));
afterEach(cleanup);
const noop = () => {};
const base = { open: true, onClose: noop, isOwn: true, onReaction: noop, onReply: noop, messageContent: 'post-id' };
describe('shared-post menu boundaries', () => {
  it.each(['image', 'gif', 'video'])('does not offer copied %s downloads or stickers', (mediaType) => {
    render(<DMHoldMenu {...base} messageType="shared_post" mediaType={mediaType} mediaUrl="https://example.invalid/copied.jpg" onSave={vi.fn()} onSaveSticker={vi.fn()} onEdit={vi.fn()} onToggleKeep={noop} />);
    expect(screen.queryByRole('button', { name: 'Save', exact: true })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save Sticker' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copy', exact: true })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit', exact: true })).toBeNull();
    expect(screen.getByRole('button', { name: 'Reply', exact: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save (keep forever)' })).toBeInTheDocument();
  });
  it('cannot edit a shared reference with no copied media', () => {
    render(<DMHoldMenu {...base} messageType="shared_post" onEdit={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Edit', exact: true })).toBeNull();
  });
  it('preserves download and sticker actions for directly sent images', () => {
    const save = vi.fn(); const sticker = vi.fn();
    render(<DMHoldMenu {...base} messageType="image" mediaType="image" mediaUrl="https://example.test/direct.jpg" onSave={save} onSaveSticker={sticker} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Sticker' }));
    expect(save).toHaveBeenCalledOnce(); expect(sticker).toHaveBeenCalledOnce();
  });
});
