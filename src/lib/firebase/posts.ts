import {
  getDocument,
  getDocuments,
  setDocument,
  updateDocument,
  deleteDocument,
  where,
  orderBy,
  firestoreLimit,
} from './firestoreDb';
import { firebaseStorage } from './storageService';
import { firebaseAuth } from './authService';
import { getUserProfile } from './users';
import type { PostDocument } from './types';

type PostRow = PostDocument & {
  like_count?: number;
  comment_count?: number;
};

export interface PostWithAuthor extends PostDocument {
  author?: {
    id: string;
    username: string;
    display_name?: string | null;
    avatar_url?: string | null;
    is_verified?: boolean | null;
  };
  like_count?: number;
  comment_count?: number;
  is_liked?: boolean;
  is_bookmarked?: boolean;
}

export async function getPost(postId: string): Promise<PostWithAuthor | null> {
  const post = await getDocument<PostDocument>('posts', postId);
  if (!post) return null;
  const author = await getUserProfile(post.author_id);
  return {
    ...post,
    author: author ? {
      id: author.id,
      username: author.username,
      display_name: author.display_name,
      avatar_url: author.avatar_url,
      is_verified: author.is_verified,
    } : undefined,
  };
}

export async function listPosts(opts?: {
  type?: string;
  authorId?: string;
  excludeAuthorId?: string;
  limit?: number;
}): Promise<PostWithAuthor[]> {
  const constraints: any[] = [orderBy('created_at', 'desc'), firestoreLimit(opts?.limit ?? 100)];

  if (opts?.authorId) {
    constraints.unshift(where('author_id', '==', opts.authorId));
  }

  let posts = await getDocuments<PostDocument>('posts', constraints);

  if (opts?.excludeAuthorId) {
    posts = posts.filter((p) => p.author_id !== opts.excludeAuthorId);
  }
  if (opts?.type) {
    posts = posts.filter((p) => p.type === opts.type);
  }

  const authorIds = [...new Set(posts.map((p) => p.author_id))];
  const postIds = posts.map((p) => p.id);
  const { data: { user } } = await firebaseAuth.getUser();
  const viewerId = user?.id;

  const [authors, likedRows, bookmarkRows] = await Promise.all([
    Promise.all(authorIds.map((id) => getUserProfile(id))),
    viewerId && postIds.length
      ? getDocuments<{ post_id?: string }>('likes', [
          where('user_id', '==', viewerId),
          where('post_id', 'in', postIds.slice(0, 10)),
        ])
      : Promise.resolve([]),
    viewerId && postIds.length
      ? getDocuments<{ post_id?: string }>('bookmarks', [
          where('user_id', '==', viewerId),
          where('post_id', 'in', postIds.slice(0, 10)),
        ])
      : Promise.resolve([]),
  ]);

  const authorMap = new Map(authors.filter(Boolean).map((a) => [a!.id, a!]));
  const likedSet = new Set(likedRows.map((r) => r.post_id).filter(Boolean));
  const bookmarkSet = new Set(bookmarkRows.map((r) => r.post_id).filter(Boolean));

  // Extra post IDs beyond Firestore `in` limit of 10 — client filter
  if (viewerId && postIds.length > 10) {
    const extraIds = postIds.slice(10);
    const [extraLikes, extraBookmarks] = await Promise.all([
      getDocuments<{ post_id?: string }>('likes', [where('user_id', '==', viewerId)]),
      getDocuments<{ post_id?: string }>('bookmarks', [where('user_id', '==', viewerId)]),
    ]);
    for (const r of extraLikes) {
      if (r.post_id && extraIds.includes(r.post_id)) likedSet.add(r.post_id);
    }
    for (const r of extraBookmarks) {
      if (r.post_id && extraIds.includes(r.post_id)) bookmarkSet.add(r.post_id);
    }
  }

  return posts
    .map((post) => {
      const author = authorMap.get(post.author_id);
      if (!author) return null;
      const row = post as PostRow;
      return {
        ...post,
        author: {
          id: author.id,
          username: author.username,
          display_name: author.display_name,
          avatar_url: author.avatar_url,
          is_verified: author.is_verified,
        },
        like_count: Number(row.like_count ?? 0),
        comment_count: Number(row.comment_count ?? 0),
        is_liked: likedSet.has(post.id),
        is_bookmarked: bookmarkSet.has(post.id),
      };
    })
    .filter((p): p is any => p !== null) as PostWithAuthor[];
}

export async function createPost(
  authorId: string,
  payload: Omit<PostDocument, 'id' | 'author_id' | 'created_at'>,
): Promise<PostDocument> {
  const id = crypto.randomUUID();
  const post: PostDocument = {
    ...payload,
    id,
    author_id: authorId,
    created_at: new Date().toISOString(),
    view_count: payload.view_count ?? 0,
    is_pinned: payload.is_pinned ?? false,
  };
  await setDocument('posts', id, post);
  return post;
}

export async function updatePost(postId: string, updates: Partial<PostDocument>): Promise<void> {
  await updateDocument('posts', postId, updates);
}

export async function deletePost(postId: string): Promise<void> {
  await deleteDocument('posts', postId);
}

export async function uploadPostMedia(
  authorId: string,
  file: File | Blob,
  path: string,
): Promise<string | null> {
  const fullPath = `${authorId}/${path}`;
  const { error } = await firebaseStorage.from('media').upload(fullPath, file);
  if (error) return null;
  return firebaseStorage.resolveDownloadUrl('media', fullPath);
}
