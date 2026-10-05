import { createHash } from 'node:crypto';
import { DocumentReference } from 'firebase-admin/firestore';
// Historical documents may contain Firestore references in unrelated metadata.
// Fingerprint their stable path, never the SDK's cyclic connection internals.
const canonical = (value) => value instanceof DocumentReference ? { firestoreReference: value.path }
    : Array.isArray(value) ? value.map(canonical)
        : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : value;
export const publicationHash = (value) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export const validPublicationRevision = (value) => typeof value === 'string' && /^[a-f0-9]{48}$/.test(value);
export const validPublicationPostId = (value) => typeof value === 'string' && !!value && !value.includes('/') && value !== '.' && value !== '..' && Buffer.byteLength(value) <= 1500;
export function validPublicationMediaUrl(value) {
    if (typeof value !== 'string' || !value || value.length > 8192)
        return false;
    try {
        const url = new URL(value);
        if (url.username || url.password || url.hash)
            return false;
        if (url.protocol === 'https:')
            return true;
        const project = process.env.GCLOUD_PROJECT || '', host = process.env.FIREBASE_STORAGE_EMULATOR_HOST || '';
        if (project === 'demo-vybe-preview' && host === '127.0.0.1:9399' && process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8280'
            && process.env.FIREBASE_AUTH_EMULATOR_HOST === '127.0.0.1:9199' && url.protocol === 'http:'
            && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && url.port === '8082'
            && /^\/v0\/b\/demo-vybe-preview\.appspot\.com\/o\//.test(url.pathname))
            return true;
        return /^demo-[a-z0-9-]+$/.test(project) && /^127\.0\.0\.1:\d+$/.test(host) && url.protocol === 'http:' && url.host === host
            && new RegExp(`^/v0/b/${project}(?:\\.appspot\\.com|\\.firebasestorage\\.app)?/o/`).test(url.pathname);
    }
    catch {
        return false;
    }
}
/** Presentation counters, AI analysis, pinning and moderation do not establish
 * authorship. Every field that publishes content or audience is bound here. */
export function postSourceFingerprint(row) {
    return publicationHash(['author_id', 'user_id', 'type', 'caption', 'tags', 'media_url', 'media_urls', 'thumbnail_url', 'created_at',
        'visibility', 'audience', 'is_private', 'game_capture_id', 'sound_id', 'filter_id', 'age_rating', 'vybe_check_id'].map(key => [key, row[key] ?? null]));
}
export const postLegacyRevision = (row) => publicationHash(['legacy', row]).slice(0, 48);
export function validPostPublication(row, proof, owner, postId) {
    return proof?.version === 1 && proof.status === 'published' && proof.post_id === postId && proof.owner_uid === owner.uid
        && proof.profile_id === owner.profileId && owner.aliases.includes(row.author_id)
        && (row.user_id === undefined || owner.aliases.includes(row.user_id)) && validPublicationRevision(proof.revision)
        && proof.source_fingerprint === postSourceFingerprint(row);
}
export function postPublicationAdmission(row, proof, owner, postId, viewerUid) {
    if (validPostPublication(row, proof, owner, postId))
        return { publicationRevision: proof.revision, needsOwnerConfirmation: false };
    // A read never attests a historical caller-writable author field. A protected
    // but inconsistent/tombstoned row cannot downgrade itself into legacy recovery.
    if (!proof && owner.uid === viewerUid)
        return { publicationRevision: postLegacyRevision(row), needsOwnerConfirmation: true };
    return null;
}
//# sourceMappingURL=postPublicationProof.js.map