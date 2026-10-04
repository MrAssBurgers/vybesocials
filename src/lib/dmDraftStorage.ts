import { isMessageSessionCurrent } from '@/lib/messagesQueryKey';
import { reportAccountSnapshot, type ReportAccountSession } from '@/lib/reportModerationService';

function draftKey(conversationId: string, session: ReportAccountSession) {
  return `vybe-dm-draft-v2:${JSON.stringify([session.uid, conversationId])}`;
}

/** Never adopt ownerless localStorage drafts from earlier clients. */
export function readDmDraft(conversationId: string | undefined, session = reportAccountSnapshot()): string {
  if (!conversationId || !session.uid || !isMessageSessionCurrent(session)) return '';
  try { return sessionStorage.getItem(draftKey(conversationId, session)) || ''; } catch { return ''; }
}

export function writeDmDraft(conversationId: string | undefined, text: string, session = reportAccountSnapshot()): void {
  if (!conversationId || !session.uid || !isMessageSessionCurrent(session)) return;
  try {
    const key = draftKey(conversationId, session);
    if (text) sessionStorage.setItem(key, text); else sessionStorage.removeItem(key);
  } catch { /* A restricted browser still keeps the current mounted draft in memory. */ }
}
