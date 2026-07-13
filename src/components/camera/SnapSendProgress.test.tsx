import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SnapSendProgress } from './SnapSendProgress';

const snapshots = vi.hoisted(() => ({
  jobs: [] as Array<{
    jobId: string;
    phase: string;
    uploadProgress: number;
    destinations: Array<{ kind: string; id: string; state: string }>;
    mediaType: 'photo' | 'video';
    createdAt: number;
  }>,
}));

vi.mock('@/lib/camera/snapSendService', () => ({
  registerSnapSendQueryClient: vi.fn(),
  startSnapSendQueue: vi.fn(),
  getSnapJobSnapshots: () => snapshots.jobs,
  subscribeSnapJobs: (cb: () => void) => {
    cb();
    return () => {};
  },
  dismissSnapJob: vi.fn(),
  retrySnapJob: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({}),
}));

vi.mock('framer-motion', async () => {
  const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
  return { ...actual, useReducedMotion: () => true };
});

describe('SnapSendProgress', () => {
  beforeEach(() => {
    snapshots.jobs = [];
  });

  it('shows waiting for connection for offline ephemeral sends', () => {
    snapshots.jobs = [
      {
        jobId: 'j1',
        phase: 'waiting_for_connection',
        uploadProgress: 0,
        destinations: [{ kind: 'conversation', id: 'c1', state: 'pending' }],
        mediaType: 'photo',
        createdAt: Date.now(),
      },
    ];
    render(<SnapSendProgress />);
    expect(screen.getByText(/Waiting for connection/i)).toBeTruthy();
  });

  it('shows retry for partial failures', () => {
    snapshots.jobs = [
      {
        jobId: 'j2',
        phase: 'partially_sent',
        uploadProgress: 1,
        destinations: [
          { kind: 'conversation', id: 'c1', state: 'sent' },
          { kind: 'conversation', id: 'c2', state: 'failed' },
        ],
        mediaType: 'photo',
        createdAt: Date.now(),
      },
    ];
    render(<SnapSendProgress />);
    expect(screen.getByLabelText('Retry failed')).toBeTruthy();
  });
});
