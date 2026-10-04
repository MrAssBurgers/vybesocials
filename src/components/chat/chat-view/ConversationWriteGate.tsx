import type { PropsWithChildren } from 'react';

export function isConversationWriteBlocked(input: { isError: boolean; isFetched: boolean; hasConversation: boolean; error: unknown }) {
  if (!input.isFetched || !input.isError) return false;
  const code = input.error && typeof input.error === 'object' && 'code' in input.error ? String(input.error.code) : '';
  return !input.hasConversation || /permission-denied|unauthenticated|not-found|account-changed/.test(code);
}

export function ConversationWriteGate({ blocked, children }: PropsWithChildren<{ blocked: boolean }>) {
  return blocked ? <div role="status" className="border-t border-border bg-background px-4 py-5 text-center text-sm text-muted-foreground">
    Sending is unavailable because this conversation could not be verified for your account. Try refreshing the conversation.
  </div> : <>{children}</>;
}
