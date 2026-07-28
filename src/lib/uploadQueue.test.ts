import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/postUploadPipeline', () => ({
  runPostUpload: vi.fn(),
}));

import { runPostUpload } from '@/lib/postUploadPipeline';
import {
  enqueuePostUpload,
  getUploadJobs,
  retryUploadJob,
  dismissUploadJob,
} from '@/lib/uploadQueue';

describe('uploadQueue', () => {
  beforeEach(() => {
    getUploadJobs().forEach((j) => dismissUploadJob(j.id));
    vi.mocked(runPostUpload).mockReset();
  });

  it('enqueues with optimizing stage and retains input for retry', async () => {
    let resolveUpload!: (v: { postId: string }) => void;
    vi.mocked(runPostUpload).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpload = resolve;
        }),
    );

    const input = {
      profile: { id: 'p1', user_id: 'u1' },
      caption: 'hello',
      tags: [] as string[],
      type: 'post' as const,
    };
    const id = enqueuePostUpload(input, 'Test post');
    const job = getUploadJobs().find((j) => j.id === id);
    expect(job?.stage).toBe('optimizing');
    expect(job?.input).toMatchObject(input);
    expect(job?.input?.clientPostId).toEqual(expect.any(String));

    resolveUpload({ postId: 'post-1' });
    await vi.waitFor(() => {
      expect(getUploadJobs().find((j) => j.id === id)?.stage).toBe('done');
    });
  });

  it('retryUploadJob re-runs failed jobs', async () => {
    vi.mocked(runPostUpload)
      .mockResolvedValueOnce({ failed: true, reason: 'Vybe Check blocked' })
      .mockResolvedValueOnce({ postId: 'post-2' });

    const id = enqueuePostUpload(
      {
        profile: { id: 'p1', user_id: 'u1' },
        caption: 'x',
        tags: [],
        type: 'text',
      },
      'Retry me',
    );

    await vi.waitFor(() => {
      expect(getUploadJobs().find((j) => j.id === id)?.stage).toBe('failed');
    });

    expect(retryUploadJob(id)).toBe(true);
    await vi.waitFor(() => {
      expect(getUploadJobs().find((j) => j.id === id)?.stage).toBe('done');
    });
    expect(runPostUpload).toHaveBeenCalledTimes(2);
    const firstInput = vi.mocked(runPostUpload).mock.calls[0]?.[0];
    const retryInput = vi.mocked(runPostUpload).mock.calls[1]?.[0];
    expect(firstInput.clientPostId).toBeTruthy();
    expect(retryInput.clientPostId).toBe(firstInput.clientPostId);
  });
});
