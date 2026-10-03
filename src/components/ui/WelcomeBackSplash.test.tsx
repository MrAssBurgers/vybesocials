import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WelcomeBackSplash } from './WelcomeBackSplash';

describe('WelcomeBackSplash', () => {
  afterEach(cleanup);
  it('acknowledges sign-in without locking the app shell', () => {
    render(
      <WelcomeBackSplash
        username="vybe_tester"
        onComplete={vi.fn()}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Welcome back');
    expect(screen.getByRole('status')).toHaveTextContent('@vybe_tester');
    expect(document.body).not.toHaveClass('welcome-back-visible');
    expect(document.body.style.overflow).not.toBe('hidden');
    expect(screen.getByRole('button', { name: 'Dismiss welcome message' })).toBeEnabled();
  });

  it('stays off the sign-in card until that screen is gone', async () => {
    const shell = document.createElement('div');
    shell.setAttribute('data-auth-shell', '');
    document.body.appendChild(shell);

    render(<WelcomeBackSplash username="vybe_tester" onComplete={vi.fn()} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    shell.remove();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Welcome back'));
    expect(screen.getByRole('status').className).toContain('inset-x-0');
    expect(screen.getByRole('status').className).not.toContain('-translate-x-1/2');
  });

  it('can be dismissed immediately', async () => {
    render(<WelcomeBackSplash username="vybe_tester" onComplete={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss welcome message' }));
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });
});
