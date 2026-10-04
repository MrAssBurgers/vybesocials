import { HttpsError } from 'firebase-functions/v2/https';
import type { DocumentSnapshot, Transaction } from 'firebase-admin/firestore';
import { db } from './admin.js';
import { resolveIdentity } from './profileAudienceAuthority.js';
import { validDocumentId } from './conversationMembership.js';

export type CommunityRole = 'owner' | 'admin' | 'moderator' | 'member';
export type CommunityActor = { uid: string; profileId: string };
export type Row = Record<string, any>;
export const communityRoles: CommunityRole[] = ['owner', 'admin', 'moderator', 'member'];
export function communityId(value: unknown): string {
  if (!validDocumentId(value) || value === '.' || value === '..') throw new HttpsError('invalid-argument', 'Invalid community identifier');
  return value;
}
export async function communityActor(uid: string): Promise<CommunityActor> {
  return db.runTransaction(async tx => {
    const identity = await resolveIdentity(db, tx, uid);
    if (!identity || identity.uid !== uid) throw new HttpsError('failed-precondition', 'A unique verified profile is required');
    return { uid, profileId: identity.profileId };
  });
}
export const admissionRef = (uid: string, serverId: string) => db.doc(`community_admissions/${uid}/grants/${serverId}`);
export const rosterRef = (serverId: string, uid: string) => db.doc(`community_rosters/${serverId}/members/${uid}`);
export function ownsCommunity(server: Row, actor: CommunityActor): boolean {
  return server.owner_id === actor.uid || server.owner_id === actor.profileId;
}
export function validAdmission(row: Row | undefined, serverId: string, uid: string): boolean {
  return row?.server_id === serverId && row?.auth_uid === uid && row?.active === true && communityRoles.includes(row.role);
}
export async function communityAccess(tx: Transaction, serverId: string, actor: CommunityActor) {
  // Identity participates in the same read set as membership/permissions.
  const identity = await resolveIdentity(db, tx, actor.uid);
  if (!identity || identity.uid !== actor.uid || identity.profileId !== actor.profileId) throw new HttpsError('failed-precondition', 'Your community profile changed');
  const [serverSnap, grant] = await Promise.all([tx.get(db.collection('servers').doc(serverId)), tx.get(admissionRef(actor.uid, serverId))]);
  const server = serverSnap.data() as Row | undefined;
  if (!server || server.deleted_at) throw new HttpsError('not-found', 'Community is unavailable');
  const owner = ownsCommunity(server, actor);
  if (!owner && !validAdmission(grant.data(), serverId, actor.uid)) throw new HttpsError('permission-denied', 'Join this community with a current invitation or from Discover');
  // Historical server_members roles are deliberately never an authority source.
  const role: CommunityRole = owner ? 'owner' : grant.data()!.role === 'owner' ? 'member' : grant.data()!.role;
  return { server, serverRef: serverSnap.ref, role, owner, grant };
}
export const canManageCommunity = (role: CommunityRole) => role === 'owner' || role === 'admin';
export const permissionFields = ['can_view', 'can_send', 'can_manage', 'can_pin', 'can_attach_media'] as const;
export async function channelAccess(tx: Transaction, channelId: string, actor: CommunityActor, loaded?: { channel: DocumentSnapshot; access: Awaited<ReturnType<typeof communityAccess>> }) {
  const snap = loaded?.channel || await tx.get(db.collection('channels').doc(channelId));
  const channel = snap.data() as Row | undefined;
  if (!channel || channel.deleted_at) throw new HttpsError('not-found', 'Channel is unavailable');
  const serverId = communityId(channel.server_id);
  const access = loaded?.access || await communityAccess(tx, serverId, actor);
  if (snap.id !== channelId || access.serverRef.id !== serverId) throw new HttpsError('permission-denied', 'Channel scope mismatch');
  const permission = await tx.get(db.collection('channel_permissions').doc(`${channelId}_${access.role}`));
  const row = permission.data();
  const explicit = row?.channel_id === channelId && row?.role === access.role ? row : {};
  const manager = canManageCommunity(access.role);
  const visible = manager || (Object.hasOwn(explicit, 'can_view') ? explicit.can_view === true : channel.is_private === undefined || channel.is_private === false);
  const announcements = channel.type === 'announcement' || channel.room_type === 'announcements';
  const mayPost = !announcements || access.role === 'moderator' || manager;
  const permissions = {
    can_view: visible,
    can_send: visible && (manager || (mayPost && explicit.can_send !== false)),
    can_manage: manager,
    can_pin: visible && (manager || access.role === 'moderator' || explicit.can_pin === true),
    can_attach_media: visible && (manager || explicit.can_attach_media !== false),
  };
  return { ...access, serverId, channel, channelRef: snap.ref, permissions };
}
export function writeAdmission(tx: Transaction, serverId: string, actor: CommunityActor, role: CommunityRole, joinedAt = new Date().toISOString()) {
  const row = { server_id: serverId, auth_uid: actor.uid, user_id: actor.profileId, role, active: true, joined_at: joinedAt, updated_at: new Date().toISOString() };
  tx.set(admissionRef(actor.uid, serverId), row);
  tx.set(rosterRef(serverId, actor.uid), { ...row, id: actor.uid });
}
