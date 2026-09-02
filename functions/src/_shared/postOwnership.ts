export interface PostOwnerFields {
  author_id?: unknown;
  user_id?: unknown;
}

export function resolvePostOwnerId(post: PostOwnerFields | null | undefined): string {
  const owner = post?.author_id ?? post?.user_id;
  return typeof owner === 'string' ? owner.trim() : '';
}

export function postBelongsToCaller(
  post: PostOwnerFields | null | undefined,
  authUid: string,
  profileId: string,
): boolean {
  const ownerId = resolvePostOwnerId(post);
  return Boolean(ownerId && (ownerId === authUid || ownerId === profileId));
}
