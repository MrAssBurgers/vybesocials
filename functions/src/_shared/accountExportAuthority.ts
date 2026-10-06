import type { Auth } from 'firebase-admin/auth';
import { FieldPath, type Firestore } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { parentalRequestIdentity, checkParentalAuth, resolveParentalActor } from './parentalAccountAuthority.js';

type Row = Record<string, unknown>;
const fields = (text: string) => text.split(' ');
const profileFields = fields('user_id username display_name first_name last_name avatar_url banner_url bio link_url location interests language timezone created_at updated_at onboarding_completed tutorial_completed intro_completed is_private badge_settings equipped_effect equipped_frame equipped_name_color equipped_profile_theme equipped_title equipped_badge_id');
const contentFields = fields('user_id author_id sender_id channel_id server_id conversation_id post_id parent_id reply_to_id type content caption media_url media_urls media_type thumbnail_url tags created_at updated_at edited_at is_edited is_deleted deleted_at expires_at audience visibility is_private is_pinned gif_url poll_data is_close_friends_only aspect_ratio duration');
const activityFields = fields('user_id viewer_id post_id comment_id story_id target_id target_type interaction_type type action reaction mood value created_at updated_at viewed_at watch_time watch_duration duration count');
// Explicit public data projections: no arbitrary collection access, staff records,
// PIN material, Auth tokens, API keys, confirmation evidence or peer message bodies.
export const accountExportSections = {
  profile: { collection: 'profiles', owner: null, fields: profileFields },
  private_profile: { collection: 'profile_private', owner: null, fields: fields('user_id date_of_birth created_at updated_at') },
  posts: { collection: 'posts', owner: 'author_id', fields: contentFields },
  legacy_posts: { collection: 'posts', owner: 'user_id', fields: contentFields },
  comments: { collection: 'comments', owner: 'user_id', fields: contentFields },
  legacy_comments: { collection: 'comments', owner: 'author_id', fields: contentFields },
  messages: { collection: 'messages', owner: 'sender_id', fields: contentFields },
  channel_messages: { collection: 'channel_messages', owner: 'sender_id', fields: contentFields },
  stories: { collection: 'stories', owner: 'author_id', fields: contentFields },
  legacy_stories: { collection: 'stories', owner: 'user_id', fields: contentFields },
  bookmarks: { collection: 'bookmarks', owner: 'user_id', fields: fields('user_id post_id created_at updated_at') },
  likes: { collection: 'likes', owner: 'user_id', fields: activityFields },
  comment_likes: { collection: 'comment_likes', owner: 'user_id', fields: activityFields },
  post_reactions: { collection: 'post_reactions', owner: 'user_id', fields: activityFields },
  post_views: { collection: 'post_views', owner: 'viewer_id', fields: activityFields },
  story_views: { collection: 'story_views', owner: 'viewer_id', fields: activityFields },
  interactions: { collection: 'user_interactions', owner: 'user_id', fields: activityFields },
  mood_signals: { collection: 'post_mood_signals', owner: 'user_id', fields: activityFields },
  follows: { collection: 'follows', owner: 'follower_id', fields: fields('follower_id following_id created_at') },
  blocks: { collection: 'blocked_users', owner: 'blocker_id', fields: fields('blocker_id blocked_id created_at') },
  hubs: { collection: 'servers', owner: 'owner_id', fields: fields('owner_id name description icon_url banner_url is_public created_at updated_at') },
  notes: { collection: 'user_notes', owner: 'user_id', fields: fields('user_id content gif_url expires_at created_at updated_at') },
  saved_sounds: { collection: 'user_saved_sounds', owner: 'user_id', fields: fields('user_id sound_id created_at updated_at') },
} as const;
const names = Object.keys(accountExportSections);
const validId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 1500 && !value.includes('/');
const uuid = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const changed = () => new HttpsError('failed-precondition', 'Your account changed. Reopen account settings and try again.');

/** Read-only paginated export. Each page independently rechecks current Auth and
 * canonical private binding. Client cursors select positions, never authority. */
export async function exportAccountPage(database: Firestore, auth: Pick<Auth, 'getUser'>, request: CallableRequest) {
  const input = request.data as Row;
  if (!input || typeof input !== 'object' || Array.isArray(input) || input.action !== 'export' || !uuid(input.requestId)
    || typeof input.section !== 'string' || !Object.hasOwn(accountExportSections, input.section)
    || input.after !== null && !validId(input.after)
    || Object.keys(input).some(key => !['action', 'requestId', 'section', 'after', 'expectedOwnerUid', 'expectedProfileId', 'expectedAccountCreatedAt'].includes(key))) {
    throw new HttpsError('invalid-argument', 'Valid export page details are required.');
  }
  const section = input.section as keyof typeof accountExportSections;
  if (['profile', 'private_profile'].includes(section) && input.after !== null) throw new HttpsError('invalid-argument', 'This export section has no next page.');
  const identity = parentalRequestIdentity(request, input);
  await checkParentalAuth(auth, identity);
  return database.runTransaction(async tx => {
    const actor = await resolveParentalActor(database, tx, identity);
    const aliases = [...new Set([actor.uid, actor.profileId])];
    // A profile ID must not be borrowed from another live Firebase account.
    if (actor.profileId !== actor.uid) {
      try { await auth.getUser(actor.profileId); throw changed(); }
      catch (error) { if ((error as { code?: string }).code !== 'auth/user-not-found') throw error; }
    }
    const spec = accountExportSections[section];
    let docs;
    if (spec.owner === null) docs = [await tx.get(database.doc(`${spec.collection}/${actor.profileId}`))].filter(doc => doc.exists);
    else {
      let query = database.collection(spec.collection).where(spec.owner, 'in', aliases).orderBy(FieldPath.documentId()).limit(51);
      if (input.after) query = query.startAfter(input.after);
      docs = (await tx.get(query)).docs;
    }
    const records: Row[] = []; let bytes = 0;
    for (const doc of docs.slice(0, 50)) {
      const row = doc.data()!;
      if (spec.owner && !aliases.includes(String(row[spec.owner]))) throw changed();
      if (spec.owner === null && row.user_id !== undefined && !aliases.includes(String(row.user_id))) throw changed();
      if (row.auth_created_at_ms !== undefined && row.auth_created_at_ms !== actor.created
        || row.account_created_at_ms !== undefined && row.account_created_at_ms !== actor.created
        || row.binding_revision !== undefined && row.binding_revision !== actor.bindingRevision) throw changed();
      // UID-only historical ownership must not leak a previous Auth incarnation.
      if (spec.owner && row[spec.owner] === actor.uid && actor.profileId !== actor.uid
        && typeof row.created_at === 'string' && Date.parse(row.created_at) < actor.created
        && row.auth_created_at_ms !== actor.created && row.account_created_at_ms !== actor.created) {
        throw new HttpsError('failed-precondition', 'Historical export ownership needs review. Contact support; no partial download was created.');
      }
      // Existing contradictory authorship cannot become an export entitlement.
      if (['posts', 'legacy_posts', 'comments', 'legacy_comments', 'messages', 'channel_messages', 'stories', 'legacy_stories'].includes(section)
        && ['user_id', 'author_id', 'sender_id', 'owner_uid', 'author_uid'].some(key => row[key] !== undefined && !aliases.includes(String(row[key])))) throw changed();
      const unavailableContent = row.is_deleted === true || !!row.deleted_at || typeof row.expires_at === 'string' && Date.parse(row.expires_at) <= Date.now();
      const hidden = new Set(unavailableContent ? ['content', 'caption', 'media_url', 'media_urls', 'thumbnail_url', 'gif_url', 'poll_data'] : []);
      const record = { id: doc.id, ...Object.fromEntries(spec.fields.filter(key => Object.hasOwn(row, key) && !hidden.has(key)).map(key => [key, row[key]])), ...(unavailableContent ? { content_unavailable: true } : {}) };
      const size = Buffer.byteLength(JSON.stringify(record));
      if (size > 2 * 1024 * 1024) throw new HttpsError('resource-exhausted', 'An export record is too large. Contact support for this export.');
      if (records.length && bytes + size > 2 * 1024 * 1024) break;
      records.push(record); bytes += size;
    }
    await checkParentalAuth(auth, actor);
    const hasMore = docs.length > records.length;
    return { ok: true, version: 1, ownerUid: actor.uid, profileId: actor.profileId, accountCreatedAt: actor.created,
      requestId: input.requestId, section, after: input.after, sections: names, records,
      nextAfter: hasMore ? records.at(-1)!.id : null, readAt: new Date().toISOString() };
  });
}
