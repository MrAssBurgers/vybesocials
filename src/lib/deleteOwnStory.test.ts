import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ remove: vi.fn() }));
vi.mock('@/lib/firebase/firestoreDb', () => ({ deleteDocument: state.remove }));
import { deleteOwnStory } from './deleteOwnStory';

const id = 'story-alice';

beforeEach(() => { state.remove.mockReset(); state.remove.mockResolvedValue(undefined); });

describe('delete own story', () => {
  it('deletes only a published story id after the account guard passes', async () => {
    const guard = vi.fn();
    await deleteOwnStory(id, guard);
    expect(state.remove).toHaveBeenCalledWith('stories', id);
    expect(guard).toHaveBeenCalledTimes(2);
  });

  it('does not delete another id shape', async () => {
    await expect(deleteOwnStory('stories/other', () => {})).rejects.toThrow('could not be deleted');
    expect(state.remove).not.toHaveBeenCalled();
  });
});
