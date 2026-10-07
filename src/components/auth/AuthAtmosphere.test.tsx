import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AuthWaveSurface } from './AuthAtmosphere';

describe('AuthWaveSurface', () => {
  afterEach(cleanup);

  it('keeps waves still until a sign-in or sign-up is in progress', () => {
    const { rerender } = render(
      <AuthWaveSurface>
        <button type="button">Email</button>
      </AuthWaveSurface>,
    );

    const email = screen.getByRole('button', { name: 'Email' });
    fireEvent.focus(email);
    fireEvent.pointerDown(email);
    fireEvent.input(email);
    expect(document.querySelector('.auth-wave-response')).toBeNull();
    expect(document.querySelector('.auth-wave-working')).toBeNull();

    rerender(
      <AuthWaveSurface busy>
        <button type="button">Email</button>
      </AuthWaveSurface>,
    );
    expect(document.querySelectorAll('.auth-wave-working')).toHaveLength(3);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Email' }));
    expect(document.querySelector('.auth-wave-response')).not.toBeNull();
  });
});
