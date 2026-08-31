import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FeedFailureNotice } from './FeedFailureNotice';
afterEach(cleanup);
describe('feed failure notice', () => {
  it('announces a failure without claiming the feed is empty', () => {
    render(<FeedFailureNotice label="clips" onRetry={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to load clips');
    expect(screen.queryByText('No clips yet')).not.toBeInTheDocument();
  });
  it('retries through the supplied query action', () => {
    const retry = vi.fn(); render(<FeedFailureNotice onRetry={retry} />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
  it('does not submit repeated requests while a retry is running', () => {
    const retry = vi.fn(); render(<FeedFailureNotice retrying onRetry={retry} />);
    const button = screen.getByRole('button', { name: 'Trying again…' });
    expect(button).toBeDisabled(); fireEvent.click(button);
    expect(retry).not.toHaveBeenCalled();
  });
});
