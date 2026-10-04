import { HttpsError } from 'firebase-functions/v2/https';
import type { Transaction } from 'firebase-admin/firestore';
import { db } from './admin.js';

type Row = Record<string, unknown>;
export interface ConversationIdentity { profileId: string; authUid: string; }
export interface ConversationAccess {
  isGroup: boolean;
  other: ConversationIdentity | null;
  created: boolean;
}
export function validDocumentId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200 && !value.includes('/') && ![...value].some(char => char.charCodeAt(0) < 32);
}
const aliases = (identity: ConversationIdentity) => [...new Set([identity.profileId, identity.authUid])];
export async function isConversationPairBlocked(tx: Transaction, actor: ConversationIdentity, other: ConversationIdentity): Promise<boolean> {
  const pairs = aliases(actor).flatMap(sender => aliases(other).map(recipient => [sender, recipient] as const));
  const results = await Promise.all(pairs.flatMap(([sender, recipient]) => [
    tx.get(db.collection('blocked_users').where('blocker_id', '==', sender).where('blocked_id', '==', recipient).limit(1)),
    tx.get(db.collection('blocked_users').where('blocker_id', '==', recipient).where('blocked_id', '==', sender).limit(1)),
  ]));
  return results.some(result => !result.empty);
}
export const validMembership = (data: Row | undefined, conversationId: string, identity: string, nested = false) =>
  data?.user_id === identity && (data.conversation_id === conversationId || (nested && data.conversation_id === undefined));

export async function conversationIdentity(tx: Transaction, value: string): Promise<ConversationIdentity | null> {
  if (!validDocumentId(value)) return null;
  const profile = await tx.get(db.collection('profiles').doc(value));
  if (profile.exists) {
    const uid = profile.data()?.user_id;
    return { profileId: profile.id, authUid: validDocumentId(uid) ? uid : profile.id };
  }
  const lookup = await tx.get(db.collection('profiles').where('user_id', '==', value).limit(1));
  return lookup.empty ? null : { profileId: lookup.docs[0].id, authUid: value };
}

/** Stored tuples authorize access; a predictable document name does not. */
async function memberProof(tx: Transaction, conversationId: string, identity: ConversationIdentity, parentMembers: string[], allowLegacy = false) {
  const ids = aliases(identity);
  const flat = await Promise.all(ids.map(id => tx.get(db.collection('conversation_members').doc(`${conversationId}_${id}`))));
  const nested = await Promise.all(ids.map(id => tx.get(db.doc(`conversations/${conversationId}/members/${id}`))));
  let proven = ids.some(id => parentMembers.includes(id))
    || flat.some((doc, index) => validMembership(doc.data(), conversationId, ids[index]))
    || nested.some((doc, index) => validMembership(doc.data(), conversationId, ids[index], true));
  if (!proven && allowLegacy) {
    // Legacy random-ID rows may repair only the authenticated account's aliases.
    const legacy = await Promise.all(ids.map(id => tx.get(db.collection('conversation_members')
      .where('conversation_id', '==', conversationId).where('user_id', '==', id).limit(1))));
    proven = legacy.some((result, index) => result.docs.some(doc => validMembership(doc.data(), conversationId, ids[index])));
  }
  return { proven, ids, flat };
}

/**
 * Authorize before mutation, and keep membership reads in the same transaction
 * as the message/call write. Repair never invents a peer or changes a role.
 */
export async function withConversationAccess<T>(
  conversationId: string,
  actor: ConversationIdentity,
  options: { allowCreate?: boolean; repair?: boolean; peerHint?: string | null; requirePeer?: boolean; resolveDirectPeer?: boolean },
  action: (tx: Transaction, access: ConversationAccess) => Promise<T> | T,
): Promise<T> {
  if (!validDocumentId(conversationId) || !aliases(actor).every(validDocumentId)
    || (options.peerHint != null && !validDocumentId(options.peerHint))) throw new HttpsError('invalid-argument', 'Invalid conversation or participant');
  return db.runTransaction(async tx => {
    const parentRef = db.collection('conversations').doc(conversationId);
    const parent = await tx.get(parentRef);
    const row = parent.data() || {};
    const parentMembers: string[] = Array.isArray(row.member_ids) ? row.member_ids.filter(validDocumentId) : [];
    const own = await memberProof(tx, conversationId, actor, parentMembers, true);
    const isGroup = parent.exists && (row.is_group === true || row.type === 'group');
    let other: ConversationIdentity | null = null;
    let peerProof: Awaited<ReturnType<typeof memberProof>> | null = null;

    if (!parent.exists) {
      const parts = conversationId.split('_');
      const myIds = aliases(actor);
      const inferred = parts.length === 2 && parts.every(validDocumentId)
        && parts[0] !== parts[1] && [...parts].sort().join('_') === conversationId
        ? parts.find(id => !myIds.includes(id)) : undefined;
      if (!options.allowCreate || !inferred || !parts.some(id => myIds.includes(id))) {
        throw new HttpsError('permission-denied', 'Conversation membership could not be verified');
      }
      other = await conversationIdentity(tx, inferred);
      if (!other || aliases(other).some(id => myIds.includes(id))) throw new HttpsError('permission-denied', 'Conversation participant could not be verified');
      if (options.peerHint && !aliases(other).includes(options.peerHint)) throw new HttpsError('permission-denied', 'The recipient is not part of this conversation');
      peerProof = await memberProof(tx, conversationId, other, []);
    } else {
      if (!own.proven) throw new HttpsError('permission-denied', 'Not a member of this conversation');
      if (options.requirePeer || options.peerHint || (!isGroup && (options.repair || options.resolveDirectPeer))) {
        if (!isGroup && parentMembers.length > 32) throw new HttpsError('failed-precondition', 'Conversation membership needs repair');
        const candidateIds = new Set(isGroup ? [] : parentMembers.filter(id => !aliases(actor).includes(id)));
        // Only correctly keyed, correctly scoped rows can discover an existing
        // peer. An arbitrary random-ID row cannot grant somebody else access.
        if (!isGroup) {
          const members = await tx.get(db.collection('conversation_members').where('conversation_id', '==', conversationId).limit(33));
          if (members.docs.length > 32) throw new HttpsError('failed-precondition', 'Conversation membership needs repair');
          for (const doc of members.docs) {
            const id = doc.data().user_id;
            if (validDocumentId(id) && doc.id === `${conversationId}_${id}` && validMembership(doc.data(), conversationId, id) && !aliases(actor).includes(id)) candidateIds.add(id);
          }
          // A deterministic ID can locate proof, but cannot replace proof.
          const pair = conversationId.split('_');
          if (pair.length === 2 && pair.some(id => aliases(actor).includes(id))) {
            for (const id of pair) if (!aliases(actor).includes(id)) candidateIds.add(id);
          }
        }
        if (options.peerHint) candidateIds.add(options.peerHint);
        const candidates = new Map<string, { identity: ConversationIdentity; proof: Awaited<ReturnType<typeof memberProof>> }>();
        for (const id of candidateIds) {
          const identity = await conversationIdentity(tx, id);
          if (!identity || aliases(identity).some(alias => aliases(actor).includes(alias))) continue;
          const proof = await memberProof(tx, conversationId, identity, parentMembers);
          if (proof.proven) candidates.set(identity.profileId, { identity, proof });
        }
        if (isGroup) {
          const selected = [...candidates.values()].find(candidate => options.peerHint && aliases(candidate.identity).includes(options.peerHint));
          if (options.requirePeer || options.peerHint) {
            if (!selected) throw new HttpsError('permission-denied', 'The recipient is not a member of this conversation');
            other = selected.identity; peerProof = selected.proof;
          }
        } else {
          if (candidates.size !== 1) throw new HttpsError('permission-denied', 'The other participant could not be verified');
          const selected = [...candidates.values()][0];
          other = selected.identity; peerProof = selected.proof;
          if (options.peerHint && !aliases(other).includes(options.peerHint)) throw new HttpsError('permission-denied', 'The recipient is not part of this conversation');
        }
      }
    }
    const repairProofs = options.repair ? [own, ...(peerProof && !isGroup ? [peerProof] : [])] : [];
    for (const proof of repairProofs) {
      if (proof.flat.some((doc, index) => doc.exists && !validMembership(doc.data(), conversationId, proof.ids[index]))) {
        throw new HttpsError('permission-denied', 'Conversation membership needs repair');
      }
    }
    const result = await action(tx, { isGroup, other, created: !parent.exists });
    if (options.repair) {
      const now = new Date().toISOString();
      if (!parent.exists) {
        tx.create(parentRef, { id: conversationId, is_group: false, member_ids: [...new Set([...aliases(actor), ...aliases(other!)])],
          name: null, avatar_url: null, created_by: actor.profileId, created_at: now, updated_at: now });
      } else {
        tx.update(parentRef, { member_ids: [...new Set([...parentMembers, ...aliases(actor)])], updated_at: now });
      }
      for (const proof of repairProofs) {
        proof.flat.forEach((doc, index) => {
          if (!doc.exists) tx.create(doc.ref, { id: doc.id, conversation_id: conversationId, user_id: proof.ids[index], role: 'member',
            is_muted: false, is_pinned: false, last_read_at: null, created_at: now, updated_at: now });
        });
      }
    }
    return result;
  });
}
