/**
 * The message query used to wait until the profile document matched the auth
 * user. On a phone that resolve often finished only after the inbox navigation,
 * so the thread sat empty for the whole profile lookup plus a membership repair.
 * The auth uid is a valid actor and can start the read immediately.
 */
export function dmThreadActorId(input: {
  accountReady: boolean;
  authUid?: string | null;
  profileId?: string | null;
  profileUserId?: string | null;
  profileDocumentId?: string | null;
}): string | undefined {
  if (!input.accountReady || !input.authUid) return undefined;
  if (input.profileId) return input.profileId;
  if (input.profileUserId === input.authUid && input.profileDocumentId) return input.profileDocumentId;
  return input.authUid;
}
