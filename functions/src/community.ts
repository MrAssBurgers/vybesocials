import { createHash, randomBytes } from 'node:crypto';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import type { Transaction } from 'firebase-admin/firestore';
import { db, enforceRateLimit, rateLimit, requireAuth } from './_shared/admin.js';
import { admissionRef, channelAccess, communityAccess, communityActor, communityId,
  communityRoles, ownsCommunity, permissionFields, rosterRef, validAdmission, writeAdmission, type CommunityActor, type Row } from './_shared/communityPolicy.js';
import { conversationIdentity } from './_shared/conversationMembership.js';

const options = { region: 'us-central1' as const, invoker: 'public' as const, maxInstances: 10, concurrency: 20 };
const nowIso = () => new Date().toISOString();
const textField = (value: unknown, max: number, required = false): string => {
  if (value == null && !required) return '';
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) throw new HttpsError('invalid-argument', 'Invalid text field');
  return value.trim();
};
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const makeInvite = () => {
  const code = `vyc_${randomBytes(24).toString('base64url')}`;
  return { code, hash: hash(code), expiresAt: new Date(Date.now() + 7 * 86400_000).toISOString() };
};
async function caller(request: CallableRequest, operation: string, max = 120, window = 60) {
  const uid = requireAuth(request);
  enforceRateLimit(await rateLimit(`community:${operation}:${uid}`, max, window));
  return communityActor(uid);
}
function input(request: CallableRequest): Row {
  if (!request.data || typeof request.data !== 'object' || Array.isArray(request.data)) throw new HttpsError('invalid-argument', 'Request data required');
  return request.data;
}
function storeInvite(tx: Transaction, serverId: string, invite: ReturnType<typeof makeInvite>, oldHash?: unknown) {
  if (typeof oldHash === 'string' && /^[a-f0-9]{64}$/.test(oldHash)) tx.delete(db.collection('community_invites').doc(oldHash));
  tx.create(db.collection('community_invites').doc(invite.hash), { server_id: serverId, expires_at: invite.expiresAt, uses: 0, max_uses: 1000 });
}
function inviteFields(invite: ReturnType<typeof makeInvite>) {
  return { invite_code: invite.code, invite_hash: invite.hash, invite_expires_at: invite.expiresAt };
}
function count(server: Row) { return server.authority_version === 2 && Number.isSafeInteger(server.member_count) ? Math.max(0, server.member_count) : 0; }
function defaultChannels(serverId: string) {
  return [['general', 'text', 'chat'], ['announcements', 'announcement', 'announcements'], ['media', 'text', 'media'], ['live', 'voice', 'live'], ['questions', 'text', 'qa']]
    .map(([name, type, room_type], position) => ({ id: db.collection('channels').doc().id, server_id: serverId, name, type, room_type, position, is_private: false, created_at: nowIso() }));
}
function manager(role: string) { if (role !== 'owner' && role !== 'admin') throw new HttpsError('permission-denied', 'Community owner or administrator required'); }
function owner(value: boolean) { if (!value) throw new HttpsError('permission-denied', 'Community owner required'); }
function safeMedia(value: unknown, actor: CommunityActor) {
  if (value == null || value === '') return null;
  const raw = textField(value, 2048, true);
  let url: URL;
  try { url = new URL(raw); } catch { throw new HttpsError('invalid-argument', 'Invalid media URL'); }
  if (!['https:', 'gs:'].includes(url.protocol) || url.username || url.password) throw new HttpsError('invalid-argument', 'Invalid media URL');
  // Uploads must be in this account's namespace. External arbitrary media and
  // another account's download URL do not establish ownership.
  const project = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
  let path = '';
  const buckets = project ? [`${project}.appspot.com`, `${project}.firebasestorage.app`] : [];
  if (url.protocol === 'gs:' && buckets.includes(url.hostname)) {
    try { path = decodeURIComponent(url.pathname.slice(1)); } catch { /* fail closed */ }
  } else if (url.protocol === 'https:' && url.hostname === 'firebasestorage.googleapis.com') {
    const match = /^\/v0\/b\/([^/]+)\/o\/(.+)$/.exec(url.pathname);
    if (match && buckets.includes(match[1])) {
      try { path = decodeURIComponent(match[2]); } catch { /* fail closed */ }
    }
  }
  const segments = path.split('/');
  if (!['media', 'community-assets'].includes(segments[0]) || segments[1] !== actor.uid || segments.length < 3 || segments.some(part => !part || part === '.' || part === '..')) {
    throw new HttpsError('permission-denied', 'Upload media from your own account');
  }
  return raw;
}

export const communityCreate = onCall(options, async request => {
  const actor = await caller(request, 'create', 30, 60); const data = input(request);
  const name = textField(data.name, 80, true); const description = textField(data.description, 1000);
  if (data.isPublic != null && typeof data.isPublic !== 'boolean') throw new HttpsError('invalid-argument', 'Invalid visibility');
  if (typeof data.requestId !== 'string' || !/^[A-Za-z0-9_-]{16,80}$/.test(data.requestId)) throw new HttpsError('invalid-argument', 'Creation request ID required');
  const receipt = db.collection('community_create_receipts').doc(hash(JSON.stringify([actor.uid, data.requestId])));
  const fingerprint = hash(JSON.stringify([name, description, data.isPublic !== false]));
  const quota = db.collection('_community_create_limits').doc(actor.uid);
  const ref = db.collection('servers').doc(); const invite = makeInvite(); const channels = defaultChannels(ref.id);
  const server = { id: ref.id, name, description, owner_id: actor.profileId, is_public: data.isPublic !== false,
    member_count: 1, authority_version: 2, deleted_at: null, created_at: nowIso(), updated_at: nowIso(), ...inviteFields(invite) };
  return db.runTransaction(async tx => {
    const [prior, used] = await Promise.all([tx.get(receipt), tx.get(quota)]);
    if (prior.exists) {
      if (prior.data()!.fingerprint !== fingerprint) throw new HttpsError('already-exists', 'This creation request was used with different details');
      return { server: prior.data()!.server as typeof server };
    }
    const previous = used.data(); const freshWindow = !previous || previous.reset_at <= Date.now();
    const total = freshWindow ? 0 : previous.count;
    if (!Number.isSafeInteger(total) || total >= 5) throw new HttpsError('resource-exhausted', 'Community creation limit reached. Try again tomorrow.');
    tx.create(ref, server); writeAdmission(tx, ref.id, actor, 'owner'); storeInvite(tx, ref.id, invite);
    for (const channel of channels) tx.create(db.collection('channels').doc(channel.id), channel);
    tx.set(quota, { count: total + 1, reset_at: freshWindow ? Date.now() + 86400_000 : previous!.reset_at });
    tx.create(receipt, { fingerprint, server, created_at: nowIso() });
    return { server };
  });
});

export const communityJoin = onCall(options, async request => {
  const actor = await caller(request, 'join', 20, 60); const data = input(request);
  if ((data.serverId != null) === (data.inviteCode != null)) throw new HttpsError('invalid-argument', 'Use a public community or an invitation');
  const code = data.inviteCode == null ? null : textField(data.inviteCode, 80, true);
  if (code && !/^vyc_[A-Za-z0-9_-]{32}$/.test(code)) throw new HttpsError('not-found', 'Invitation is invalid or expired; ask for a new one');
  return db.runTransaction(async tx => {
    const inviteRef = code ? db.collection('community_invites').doc(hash(code)) : null;
    const inviteSnap = inviteRef ? await tx.get(inviteRef) : null; const invite = inviteSnap?.data();
    if (code && (!invite || Date.parse(invite.expires_at) <= Date.now() || !Number.isFinite(Date.parse(invite.expires_at)))) throw new HttpsError('not-found', 'Invitation is invalid or expired; ask for a new one');
    const serverId = communityId(code ? invite!.server_id : data.serverId);
    const serverRef = db.collection('servers').doc(serverId);
    const [serverSnap, grant] = await Promise.all([tx.get(serverRef), tx.get(admissionRef(actor.uid, serverId))]);
    const server = serverSnap.data();
    if (!server || server.deleted_at || (code ? server.invite_hash !== hash(code) : server.is_public !== true)) throw new HttpsError('not-found', 'Community is unavailable or needs an invitation');
    if (validAdmission(grant.data(), serverId, actor.uid)) return { server: { ...server, id: serverId }, alreadyMember: true };
    if (code && (!Number.isSafeInteger(invite!.uses) || invite!.uses >= invite!.max_uses)) throw new HttpsError('resource-exhausted', 'Invitation has reached its limit');
    const role = ownsCommunity(server, actor) ? 'owner' : 'member';
    writeAdmission(tx, serverId, actor, role);
    const memberCount = count(server) + 1;
    tx.update(serverRef, { member_count: memberCount, authority_version: 2, updated_at: nowIso() });
    if (inviteRef) tx.update(inviteRef, { uses: invite!.uses + 1 });
    return { server: { ...server, id: serverId, member_count: memberCount, authority_version: 2 }, alreadyMember: false };
  });
});

export const communityInvite = onCall(options, async request => {
  const actor = await caller(request, 'invite', 20, 3600); const data = input(request);
  const serverId = communityId(data.serverId); const invite = makeInvite();
  if (data.action !== 'regenerate') throw new HttpsError('invalid-argument', 'Unsupported invitation action');
  await db.runTransaction(async tx => {
    const access = await communityAccess(tx, serverId, actor); manager(access.role);
    storeInvite(tx, serverId, invite, access.server.invite_hash);
    tx.update(access.serverRef, { ...inviteFields(invite), updated_at: nowIso() });
  });
  return { inviteCode: invite.code, expiresAt: invite.expiresAt };
});

export const communityManage = onCall(options, async request => {
  const actor = await caller(request, 'manage'); const data = input(request);
  if (data.action === 'discover') {
    const search = textField(data.search, 80).toLowerCase();
    const rows = await db.collection('servers').where('is_public', '==', true).limit(100).get();
    return { servers: rows.docs.filter(doc => !doc.data().deleted_at && String(doc.data().name || '').toLowerCase().includes(search))
      .slice(0, 50).map(doc => { const row = doc.data(); delete row.invite_code; delete row.invite_hash; return { ...row, id: doc.id }; }) };
  }
  if (data.action === 'listMine') {
    const [grants, owned] = await Promise.all([
      db.collection(`community_admissions/${actor.uid}/grants`).where('active', '==', true).limit(100).get(),
      db.collection('servers').where('owner_id', 'in', [...new Set([actor.uid, actor.profileId])]).limit(100).get(),
    ]);
    const ids = new Set([...grants.docs.filter(doc => validAdmission(doc.data(), doc.id, actor.uid)).map(doc => doc.id), ...owned.docs.map(doc => doc.id)]);
    const servers = await Promise.all([...ids].map(async id => db.runTransaction(async tx => {
      try { const access = await communityAccess(tx, id, actor); return { ...access.server, id, myRole: access.role, requiresRecovery: access.owner && !validAdmission(access.grant.data(), id, actor.uid) }; }
      catch (error) { if (error instanceof HttpsError && ['permission-denied', 'not-found'].includes(error.code)) return null; throw error; }
    })));
    return { servers: servers.filter(Boolean) };
  }
  if (data.action === 'permissions' || data.action === 'listPermissions') {
    return db.runTransaction(async tx => {
      const access = await channelAccess(tx, communityId(data.channelId), actor);
      if (data.action === 'permissions') return { permissions: access.permissions };
      manager(access.role);
      const rows = await Promise.all(['admin', 'moderator', 'member'].map(async role => {
        const row = await tx.get(db.collection('channel_permissions').doc(`${data.channelId}_${role}`));
        const defaults = { can_view: access.channel.is_private === undefined || access.channel.is_private === false,
          can_send: role === 'moderator' || (access.channel.type !== 'announcement' && access.channel.room_type !== 'announcements'), can_pin: role === 'moderator', can_attach_media: true };
        const scoped = row.data()?.channel_id === data.channelId && row.data()?.role === role ? row.data() : {};
        const values = { ...defaults, ...scoped };
        return { ...values, can_view: values.can_view === true, ...(role === 'admin' ? { can_view: true, can_send: true, can_pin: true, can_attach_media: true } : {}), id: row.id, channel_id: data.channelId, role, can_manage: role === 'admin' };
      }));
      return { permissions: rows };
    });
  }
  if (['editMessage', 'deleteMessage', 'pinMessage'].includes(data.action)) {
    return db.runTransaction(async tx => {
      const channelId = communityId(data.channelId); const access = await channelAccess(tx, channelId, actor);
      const ref = db.collection('channel_messages').doc(communityId(data.messageId)); const snapshot = await tx.get(ref); const row = snapshot.data();
      if (!access.permissions.can_view || !row || row.channel_id !== channelId || (row.server_id != null && row.server_id !== access.serverId)) throw new HttpsError('permission-denied', 'Message is unavailable');
      const own = row.sender_id === actor.profileId && (row.author_id === actor.uid || row.author_id === actor.profileId);
      const moderator = ['owner', 'admin', 'moderator'].includes(access.role);
      if (data.action === 'editMessage') {
        if (!own || !access.permissions.can_send || row.is_deleted) throw new HttpsError('permission-denied', 'You cannot edit this message');
        tx.update(ref, { content: textField(data.content, 8000, true), is_edited: true, updated_at: nowIso() });
      } else if (data.action === 'deleteMessage') {
        if (!own && !moderator) throw new HttpsError('permission-denied', 'You cannot remove this message');
        tx.update(ref, { is_deleted: true, content: null, media_url: null, media_type: null, updated_at: nowIso() });
      } else {
        if (!access.permissions.can_pin || typeof data.pinned !== 'boolean' || row.is_deleted) throw new HttpsError('permission-denied', 'You cannot pin this message');
        tx.update(ref, { is_pinned: data.pinned, updated_at: nowIso() });
      }
      return { ok: true };
    });
  }
  const serverId = communityId(data.serverId); const invite = makeInvite();
  return db.runTransaction(async tx => {
    const access = await communityAccess(tx, serverId, actor);
    if (data.action === 'listChannels') {
      const channels = await tx.get(db.collection('channels').where('server_id', '==', serverId).limit(101));
      if (channels.size > 100) throw new HttpsError('resource-exhausted', 'This community needs channel pagination');
      const visible = await Promise.all(channels.docs.filter(doc => !doc.data().deleted_at).map(async doc => {
        const permitted = await channelAccess(tx, doc.id, actor, { channel: doc, access });
        return permitted.permissions.can_view ? { ...doc.data(), id: doc.id, position: doc.data().position || 0 } : null;
      }));
      return { channels: visible.filter(Boolean).sort((a, b) => Number(a!.position || 0) - Number(b!.position || 0)) };
    }
    if (data.action === 'listMembers') {
      const members = await tx.get(db.collection(`community_rosters/${serverId}/members`).limit(201));
      if (members.size > 200) throw new HttpsError('resource-exhausted', 'This community needs member pagination');
      const rows = await Promise.all(members.docs.filter(doc => validAdmission(doc.data(), serverId, doc.id)).map(async doc => {
        const row = doc.data(); const profile = await tx.get(db.collection('profiles').doc(communityId(row.user_id)));
        const p = profile.data() || {};
        return { ...row, id: doc.id, profile: { id: profile.id, username: p.username || '', display_name: p.display_name || null, avatar_url: p.avatar_url || null } };
      }));
      return { members: rows };
    }
    if (data.action === 'recoverOwner') {
      owner(access.owner);
      const channels = await tx.get(db.collection('channels').where('server_id', '==', serverId).limit(1));
      const memberCount = count(access.server) + (validAdmission(access.grant.data(), serverId, actor.uid) ? 0 : 1);
      writeAdmission(tx, serverId, actor, 'owner', access.grant.data()?.joined_at);
      storeInvite(tx, serverId, invite, access.server.invite_hash);
      const changes = { authority_version: 2, member_count: memberCount, ...inviteFields(invite), updated_at: nowIso() };
      tx.update(access.serverRef, changes);
      if (channels.empty) for (const channel of defaultChannels(serverId)) tx.create(db.collection('channels').doc(channel.id), channel);
      return { server: { ...access.server, ...changes, id: serverId } };
    }
    if (data.action === 'leave') {
      if (access.owner) throw new HttpsError('failed-precondition', 'Transfer ownership to a current member before leaving');
      tx.delete(admissionRef(actor.uid, serverId)); tx.delete(rosterRef(serverId, actor.uid));
      tx.update(access.serverRef, { member_count: Math.max(0, count(access.server) - 1), updated_at: nowIso() });
      return { ok: true };
    }
    manager(access.role);
    if (['setRole', 'removeMember', 'transferOwnership'].includes(data.action)) {
      const target = await conversationIdentity(tx, communityId(data.userId));
      if (!target) throw new HttpsError('not-found', 'Member is unavailable');
      const targetActor = { uid: target.authUid, profileId: target.profileId };
      const targetGrant = await tx.get(admissionRef(targetActor.uid, serverId));
      if (!validAdmission(targetGrant.data(), serverId, targetActor.uid)) throw new HttpsError('not-found', 'Member must rejoin with a current invitation');
      if (ownsCommunity(access.server, targetActor)) throw new HttpsError('failed-precondition', 'The owner cannot be removed or demoted');
      if (data.action === 'removeMember') {
        if (!access.owner && targetGrant.data()!.role === 'admin') throw new HttpsError('permission-denied', 'Only the owner can remove administrators');
        tx.delete(admissionRef(targetActor.uid, serverId)); tx.delete(rosterRef(serverId, targetActor.uid));
        tx.update(access.serverRef, { member_count: Math.max(0, count(access.server) - 1), updated_at: nowIso() });
      } else {
        owner(access.owner);
        if (data.action === 'transferOwnership') {
          writeAdmission(tx, serverId, actor, 'member', access.grant.data()?.joined_at);
          writeAdmission(tx, serverId, targetActor, 'owner', targetGrant.data()!.joined_at);
          tx.update(access.serverRef, { owner_id: targetActor.profileId, updated_at: nowIso() });
        } else {
          if (!['admin', 'moderator', 'member'].includes(data.role)) throw new HttpsError('invalid-argument', 'Invalid community role');
          writeAdmission(tx, serverId, targetActor, data.role, targetGrant.data()!.joined_at);
        }
      }
      return { ok: true };
    }
    if (data.action === 'updateServer') {
      const changes: Row = { updated_at: nowIso() };
      if (data.name !== undefined) changes.name = textField(data.name, 80, true);
      if (data.description !== undefined) changes.description = textField(data.description, 1000);
      if (data.iconUrl !== undefined) changes.icon_url = safeMedia(data.iconUrl, actor);
      if (data.isPublic !== undefined) {
        if (typeof data.isPublic !== 'boolean') throw new HttpsError('invalid-argument', 'Invalid visibility');
        changes.is_public = data.isPublic;
        if (access.server.is_public === true && !data.isPublic) { storeInvite(tx, serverId, invite, access.server.invite_hash); Object.assign(changes, inviteFields(invite)); }
      }
      tx.update(access.serverRef, changes); return { ok: true };
    }
    if (data.action === 'deleteServer') {
      owner(access.owner);
      if (typeof access.server.invite_hash === 'string') tx.delete(db.collection('community_invites').doc(access.server.invite_hash));
      tx.update(access.serverRef, { deleted_at: nowIso(), is_public: false, invite_code: null, invite_hash: null });
      return { ok: true };
    }
    if (data.action === 'createChannel') {
      const name = textField(data.name, 80, true); const type = data.type || 'text';
      if (!['text', 'voice', 'announcement'].includes(type) || (data.isPrivate != null && typeof data.isPrivate !== 'boolean')) throw new HttpsError('invalid-argument', 'Invalid channel');
      const existing = await tx.get(db.collection('channels').where('server_id', '==', serverId).limit(100));
      if (existing.size >= 100) throw new HttpsError('resource-exhausted', 'Community channel limit reached');
      const ref = db.collection('channels').doc();
      const channel = { id: ref.id, server_id: serverId, name, type, room_type: type === 'voice' ? 'live' : type === 'announcement' ? 'announcements' : 'chat', is_private: data.isPrivate === true, position: existing.size, created_at: nowIso() };
      tx.create(ref, channel); return { channel };
    }
    if (['deleteChannel', 'setPermission'].includes(data.action)) {
      const permitted = await channelAccess(tx, communityId(data.channelId), actor);
      if (permitted.serverId !== serverId) throw new HttpsError('permission-denied', 'Channel belongs to a different community');
      if (data.action === 'deleteChannel') tx.update(permitted.channelRef, { deleted_at: nowIso() });
      else {
        if (!communityRoles.includes(data.role) || ['owner', 'admin'].includes(data.role) || !permissionFields.includes(data.field) || data.field === 'can_manage' || typeof data.value !== 'boolean') throw new HttpsError('invalid-argument', 'Owner and administrator permissions are fixed by their role');
        tx.set(db.collection('channel_permissions').doc(`${data.channelId}_${data.role}`), { channel_id: data.channelId, role: data.role, [data.field]: data.value, updated_at: nowIso() }, { merge: true });
      }
      return { ok: true };
    }
    throw new HttpsError('invalid-argument', 'Unsupported community action');
  });
});

export const communitySendMessage = onCall(options, async request => {
  const actor = await caller(request, 'send', 60, 60); const data = input(request);
  if (data.mediaUrl != null && data.mediaUrl !== '') throw new HttpsError('failed-precondition', 'Re-share this attachment using the private upload control.');
  const channelId = communityId(data.channelId); const content = textField(data.content, 8000); const mediaUrl = null;
  if (!content && !mediaUrl) throw new HttpsError('invalid-argument', 'Message is empty');
  const clientId = data.clientMessageId == null ? null : textField(data.clientMessageId, 128, true);
  const replyToId = data.replyToId == null ? null : communityId(data.replyToId);
  const mediaType = mediaUrl ? textField(data.mediaType, 32) : null;
  const messages = db.collection('channel_messages');
  const ref = clientId ? messages.doc(hash(JSON.stringify([channelId, actor.uid, clientId]))) : messages.doc();
  const receiptRef = db.collection('community_message_receipts').doc(ref.id);
  const fingerprint = hash(JSON.stringify([channelId, actor.uid, content || null, mediaUrl, mediaType, replyToId]));
  return db.runTransaction(async tx => {
    const access = await channelAccess(tx, channelId, actor);
    if (!access.permissions.can_send || (mediaUrl && !access.permissions.can_attach_media)) throw new HttpsError('permission-denied', 'You cannot send to this channel');
    const [existing, receipt] = await Promise.all([tx.get(ref), tx.get(receiptRef)]);
    if (existing.exists || receipt.exists) {
      const row = existing.data();
      if (!row || !receipt.exists || receipt.data()!.fingerprint !== fingerprint || row.channel_id !== channelId || row.server_id !== access.serverId || row.author_id !== actor.uid || row.sender_id !== actor.profileId || row.is_deleted || row.content !== (content || null) || row.media_url !== mediaUrl || row.media_type !== mediaType || row.reply_to_id !== replyToId) {
        throw new HttpsError('already-exists', 'This message request was already used or changed. Refresh the conversation.');
      }
      return { message: { ...row, id: ref.id } };
    }
    if (replyToId) {
      const reply = await tx.get(messages.doc(replyToId));
      if (!reply.exists || reply.data()!.channel_id !== channelId || reply.data()!.is_deleted) throw new HttpsError('invalid-argument', 'Reply must reference an available message in this channel');
    }
    const message = { id: ref.id, channel_id: channelId, server_id: access.serverId, sender_id: actor.profileId, author_id: actor.uid,
      content: content || null, media_url: mediaUrl, media_type: mediaType,
      is_pinned: false, is_deleted: false, is_edited: false, reply_to_id: replyToId, created_at: nowIso() };
    tx.create(ref, message); tx.create(receiptRef, { fingerprint, author_id: actor.uid, channel_id: channelId, created_at: nowIso() });
    return { message };
  });
});
