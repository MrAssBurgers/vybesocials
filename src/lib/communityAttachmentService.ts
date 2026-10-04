import { z } from 'zod';
import { getFirebaseAuth } from '@/lib/firebase';
import { getFunctionUrl, invokeFunction } from '@/lib/firebase/functionsService';
import { communityAccountLease, communityAccountSubscribe, type CommunityAccountSession } from '@/lib/communityService';

export const COMMUNITY_ATTACHMENT_MAX = 20 * 1024 * 1024;
export const COMMUNITY_ATTACHMENT_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/webm'];
const acknowledgement = z.object({ success: z.literal(true), assetId: z.string().regex(/^[a-f0-9]{64}$/), ownerUid: z.string(), channelId: z.string(),
  messageId: z.string().regex(/^attachment_[a-f0-9]{64}$/), objectPath: z.string(), byteSize: z.number().int().positive().max(COMMUNITY_ATTACHMENT_MAX),
  contentType: z.string(), status: z.enum(['uploading', 'uploaded', 'ready']), expiresAt: z.number().int(), uploadRequired: z.boolean().optional(), message: z.unknown().optional() });
export interface CommunityAttachmentDraft { requestId: string; channelId: string; file: File; content: string; session: CommunityAccountSession }
export function validateCommunityAttachment(file: File) {
  if (!COMMUNITY_ATTACHMENT_TYPES.includes(file.type) || !Number.isSafeInteger(file.size) || file.size < 1 || file.size > COMMUNITY_ATTACHMENT_MAX) throw new Error('Choose a PNG, JPEG, WebP, MP4 or WebM file up to 20 MiB.');
}
async function request(draft: CommunityAttachmentDraft, body: Record<string, unknown>, guard: () => void) {
  guard(); const result = await invokeFunction('communityAttachment', { ...body, expectedOwnerUid: draft.session.uid }); guard();
  if (result.error) throw new Error(result.error.message || 'Attachment could not be sent. Retry this upload.');
  const value = verifiedAcknowledgement(draft, result.data);
  if (body.action === 'finalize' && value.assetId !== body.assetId) throw new Error('The private upload response could not be verified.');
  return value;
}
function verifiedAcknowledgement(draft: CommunityAttachmentDraft, data: unknown) {
  const checked = acknowledgement.safeParse(data);
  const pathPrefix = checked.success ? `community-private/${draft.session.uid}/${checked.data.assetId}/` : '';
  if (!checked.success || checked.data.ownerUid !== draft.session.uid || checked.data.channelId !== draft.channelId
    || !checked.data.objectPath.startsWith(pathPrefix)
    || !(checked.data.status === 'uploading' ? checked.data.objectPath === `${pathPrefix}original` : /^sealed_[a-f0-9]{32}$/.test(checked.data.objectPath.slice(pathPrefix.length)))
    || checked.data.messageId !== `attachment_${checked.data.assetId}` || checked.data.byteSize !== draft.file.size || checked.data.contentType !== draft.file.type) throw new Error('The private upload response could not be verified.');
  return checked.data;
}
export async function sendCommunityAttachment(draft: CommunityAttachmentDraft, signal: AbortSignal, progress: (value: number) => void, viewGuard: () => void = () => {}) {
  const lease = communityAccountLease(draft.session.uid, draft.session);
  const guard = () => { lease(); viewGuard(); if (signal.aborted) throw new Error('Upload stopped. Reopen the channel to check whether it was sent.'); };
  guard(); validateCommunityAttachment(draft.file);
  const reserved = await request(draft, { action: 'reserve', requestId: draft.requestId, channelId: draft.channelId,
    content: draft.content, byteSize: draft.file.size, contentType: draft.file.type }, guard);
  // Always recover a completed/unknown upload first; immutable objects cannot be overwritten.
  let finalized = await request(draft, { action: 'finalize', assetId: reserved.assetId }, guard);
  if (finalized.status === 'uploading' && finalized.uploadRequired === true) {
    guard();
    const controller = new AbortController();
    const cancel = () => controller.abort(); const stopAccount = communityAccountSubscribe(() => { try { guard(); } catch { cancel(); } });
    signal.addEventListener('abort', cancel, { once: true });
    const deadline = setTimeout(cancel, 60_000);
    try {
      const user = getFirebaseAuth()?.currentUser;
      if (!user || user.uid !== draft.session.uid) throw new Error('Your account changed.');
      const token = await user.getIdToken(); guard();
      if (controller.signal.aborted) throw new Error('Upload stopped. Retry the same attachment.');
      const response = await fetch(`${getFunctionUrl('communityAttachmentBytes')}/uploads/${reserved.assetId}`, {
        method: 'PUT', body: draft.file, signal: controller.signal, cache: 'no-store', credentials: 'omit',
        headers: { Authorization: `Bearer ${token}`, 'X-Vybe-Owner': draft.session.uid!, 'Content-Type': draft.file.type },
      });
      guard(); if (!response.ok) throw new Error('The upload was not confirmed. Retry the same attachment.');
      const uploaded = verifiedAcknowledgement(draft, await response.json()); guard();
      if (controller.signal.aborted || uploaded.assetId !== reserved.assetId || !['uploaded', 'ready'].includes(uploaded.status)) throw new Error('The upload has not been confirmed. Retry the same attachment.');
      progress(100);
    } finally { clearTimeout(deadline); signal.removeEventListener('abort', cancel); stopAccount(); }
    guard(); finalized = await request(draft, { action: 'finalize', assetId: reserved.assetId }, guard);
  }
  const message = z.object({ id: z.string(), attachment_id: z.string(), channel_id: z.string(), author_id: z.string(), media_url: z.null() }).safeParse(finalized.message);
  if (finalized.status !== 'ready' || finalized.uploadRequired || !message.success || message.data.id !== finalized.messageId
    || message.data.attachment_id !== finalized.assetId || message.data.channel_id !== draft.channelId || message.data.author_id !== draft.session.uid) throw new Error('The upload has not been confirmed. Retry the same attachment.');
  guard(); return finalized.messageId;
}

export async function fetchCommunityAttachment(messageId: string, session: CommunityAccountSession, signal: AbortSignal, head = false): Promise<Blob | null> {
  const controller = new AbortController(); const abort = () => controller.abort();
  if (signal.aborted) controller.abort(); else signal.addEventListener('abort', abort, { once: true });
  const deadline = setTimeout(abort, head ? 10_000 : 60_000);
  try { return await readCommunityAttachmentResponse(messageId, session, controller.signal, head); }
  finally { clearTimeout(deadline); signal.removeEventListener('abort', abort); }
}
async function readCommunityAttachmentResponse(messageId: string, session: CommunityAccountSession, signal: AbortSignal, head: boolean): Promise<Blob | null> {
  const guard = communityAccountLease(session.uid, session); guard();
  if (!/^attachment_[a-f0-9]{64}$/.test(messageId)) throw new Error('This attachment needs to be shared again.');
  const user = getFirebaseAuth()?.currentUser;
  if (!user || user.uid !== session.uid) throw new Error('Your account changed.');
  const token = await user.getIdToken(); guard();
  if (signal.aborted) throw new Error('Attachment request stopped.');
  const response = await fetch(`${getFunctionUrl('communityAttachmentBytes')}/${messageId}`, { method: head ? 'HEAD' : 'GET', signal,
    cache: 'no-store', credentials: 'omit', headers: { Authorization: `Bearer ${token}`, 'X-Vybe-Owner': session.uid! } });
  guard(); if (signal.aborted) throw new Error('The attachment request timed out or closed. Retry to open it.');
  if (!response.ok) throw new Error('This attachment is unavailable. Your channel access may have changed.');
  const type = response.headers.get('Content-Type')?.split(';')[0] || '', size = Number(response.headers.get('Content-Length'));
  if (!COMMUNITY_ATTACHMENT_TYPES.includes(type) || !Number.isSafeInteger(size) || size < 1 || size > COMMUNITY_ATTACHMENT_MAX) throw new Error('The attachment response could not be verified.');
  if (head) return null;
  // Keep a malicious/misconfigured response from growing beyond the advertised bound.
  if (!response.body) throw new Error('The attachment response was empty.');
  const reader = response.body.getReader(); const chunks: Uint8Array<ArrayBuffer>[] = []; let total = 0;
  try {
    while (true) {
      guard(); if (signal.aborted) throw new Error('Attachment request stopped.');
      const next = await reader.read(); guard(); if (next.done) break;
      total += next.value.byteLength;
      if (total > size || total > COMMUNITY_ATTACHMENT_MAX) throw new Error('The attachment exceeded its size limit.');
      chunks.push(new Uint8Array(next.value));
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
  guard(); if (total !== size) throw new Error('The attachment download was incomplete. Retry to open it.');
  return new Blob(chunks, { type });
}
