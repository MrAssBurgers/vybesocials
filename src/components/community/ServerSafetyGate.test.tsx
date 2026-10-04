import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ level: 'protected' as string | undefined }));
vi.mock('@/hooks/useSafetySettings', () => ({ useSafetySettings: () => ({ data: state.level ? { content_filter_level: state.level } : undefined }) }));
import { ServerSafetyGate } from './ServerSafetyGate';
afterEach(cleanup);
beforeEach(() => { state.level = 'protected'; });
describe('community media reveal does not fetch hidden media', () => {
  it.each(['image', 'video'])('does not mount %s or its bearer URL until Reveal', mediaType => {
    const url = 'https://example.invalid/private?token=bearer';
    const { container } = render(<ServerSafetyGate mediaUrl={url} mediaType={mediaType} />);
    expect(container.querySelector('img,video')).toBeNull(); expect(container.innerHTML).not.toContain(url);
    fireEvent.click(screen.getByRole('button', { name: 'Reveal' }));
    expect(container.querySelector('img,video')).toHaveAttribute('src', url);
  });
  it('requires another explicit reveal when a message changes its attachment', () => {
    const { container, rerender } = render(<ServerSafetyGate mediaUrl="https://example.invalid/a" mediaType="image" />);
    fireEvent.click(screen.getByRole('button', { name: 'Reveal' }));
    rerender(<ServerSafetyGate mediaUrl="https://example.invalid/b" mediaType="image" />);
    expect(container.querySelector('img,video')).toBeNull(); expect(screen.getByRole('button', { name: 'Reveal' })).toBeVisible();
  });
  it('waits for an explicit reveal while filter preferences are unavailable', () => {
    state.level = undefined; const { container } = render(<ServerSafetyGate mediaUrl="https://example.invalid/a" mediaType="image" />);
    expect(container.querySelector('img,video')).toBeNull();
  });
  it.each(['moderate', 'minimal'])('honors %s display without inventing a media scan', level => {
    state.level = level; const { container } = render(<ServerSafetyGate mediaUrl="https://example.invalid/a" mediaType="image" />);
    expect(container.querySelector('img')).toBeTruthy(); expect(screen.queryByText('Scanned')).toBeNull();
  });
});
