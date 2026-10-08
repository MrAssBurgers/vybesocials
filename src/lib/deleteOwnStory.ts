import { deleteDocument } from '@/lib/firebase/firestoreDb';

/** Remove one story the signed-in person published. Rules reject every other id. */
export async function deleteOwnStory(storyId: string, guard: () => void): Promise<void> {
  guard();
  if (!storyId || storyId.length > 128 || storyId.includes('/') || storyId === '.' || storyId === '..') throw new Error('This story could not be deleted.');
  await deleteDocument('stories', storyId);
  guard();
}
