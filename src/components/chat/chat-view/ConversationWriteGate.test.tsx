import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ConversationWriteGate, isConversationWriteBlocked } from './ConversationWriteGate';
afterEach(cleanup);

describe('unavailable private conversation controls', () => {
  it('removes composing and capture controls after a confirmed permission failure', () => {
    const children = <><textarea aria-label="Message" /><button>Vybe Snap</button></>;
    const view = render(<ConversationWriteGate blocked={false}>{children}</ConversationWriteGate>);
    expect(screen.getByRole('textbox', { name: 'Message' })).toBeInTheDocument();
    view.rerender(<ConversationWriteGate blocked={isConversationWriteBlocked({ isError: true, isFetched: true, hasConversation: true, error: { code: 'permission-denied' } })}>{children}</ConversationWriteGate>);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Vybe Snap' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('could not be verified for your account');
  });
  it('does not block normal hydration or a transient reload failure with an existing conversation', () => {
    expect(isConversationWriteBlocked({ isError: false, isFetched: false, hasConversation: false, error: null })).toBe(false);
    expect(isConversationWriteBlocked({ isError: true, isFetched: true, hasConversation: true, error: { code: 'unavailable' } })).toBe(false);
    expect(isConversationWriteBlocked({ isError: true, isFetched: true, hasConversation: false, error: { code: 'unavailable' } })).toBe(true);
  });
});
