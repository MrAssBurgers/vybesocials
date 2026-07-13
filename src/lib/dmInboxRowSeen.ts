const seenConversationIds = new Set<string>();

export function markDmRowSeen(conversationId: string): boolean {
  const already = seenConversationIds.has(conversationId);
  if (!already) seenConversationIds.add(conversationId);
  return already;
}

export function hasSeenDmRow(conversationId: string): boolean {
  return seenConversationIds.has(conversationId);
}

export function resetDmRowSeenForTests(): void {
  seenConversationIds.clear();
}
