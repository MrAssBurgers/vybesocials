export function resolvePostOwnerId(post) {
    const owner = post?.author_id ?? post?.user_id;
    return typeof owner === 'string' ? owner.trim() : '';
}
export function postBelongsToCaller(post, authUid, profileId) {
    const ownerId = resolvePostOwnerId(post);
    return Boolean(ownerId && (ownerId === authUid || ownerId === profileId));
}
//# sourceMappingURL=postOwnership.js.map