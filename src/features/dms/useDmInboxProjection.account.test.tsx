import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DmInboxEntryDoc } from './dm.types';
const runtime = vi.hoisted(() => ({
  uid: 'alice', viewer: 'alice-profile', epoch: 1,
  loads: [] as { resolve: (rows: DmInboxEntryDoc[]) => void }[],
  streams: [] as { receive: (rows: DmInboxEntryDoc[]) => void; unsubscribe: ReturnType<typeof vi.fn> }[],
}));
vi.mock('@/hooks/useReportAccountSession', () => ({ useReportAccountSession: () => ({ uid: runtime.uid, epoch: runtime.epoch }) }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountSnapshot: () => ({ uid: runtime.uid, epoch: runtime.epoch }) }));
vi.mock('@/lib/dmInboxFeatureFlags', () => ({ isDmInboxProjectionReadEnabled: () => true, isDmInboxShadowCompareEnabled: () => false }));
vi.mock('@/lib/dmInboxProjection', () => ({
  loadDmInboxProjection: () => new Promise<DmInboxEntryDoc[]>(resolve => runtime.loads.push({ resolve })),
  subscribeDmInboxProjection: (_viewer: string, receive: (rows: DmInboxEntryDoc[]) => void) => {
    const unsubscribe = vi.fn(); runtime.streams.push({ receive, unsubscribe }); return unsubscribe;
  },
}));
import { useDmInboxProjection } from './useDmInboxProjection';
const row = (viewer = 'alice-profile', id = 'alice-private-chat') => ({ viewer_id: viewer, conversation_id: id } as DmInboxEntryDoc);
beforeEach(() => { runtime.uid = 'alice'; runtime.viewer = 'alice-profile'; runtime.epoch = 1; runtime.loads = []; runtime.streams = []; });
afterEach(cleanup);
describe('inbox projection account and delivery boundaries', () => {
  it('clears the old viewer and rejects late results and foreign rows', async () => {
    const hook = renderHook(() => useDmInboxProjection(runtime.viewer));
    act(() => runtime.streams[0].receive([row()]));
    expect(hook.result.current.entries).toHaveLength(1);
    runtime.uid = 'bob'; runtime.viewer = 'bob-profile'; runtime.epoch++; hook.rerender();
    expect(hook.result.current.entries).toEqual([]);
    await act(async () => runtime.loads[0].resolve([row()]));
    expect(hook.result.current.entries).toEqual([]);
    act(() => runtime.streams[1].receive([row(), row('bob-profile', 'bob-chat')]));
    expect(hook.result.current.entries.map(entry => entry.conversation_id)).toEqual(['bob-chat']);
    expect(runtime.streams[0].unsubscribe).toHaveBeenCalledOnce();
  });
  it('does not revive an old same-account session', async () => {
    const hook = renderHook(() => useDmInboxProjection(runtime.viewer));
    act(() => runtime.streams[0].receive([row()]));
    runtime.epoch++; hook.rerender();
    expect(hook.result.current.entries).toEqual([]);
    act(() => runtime.streams[1].receive([row('alice-profile', 'new-session')]));
    await act(async () => runtime.loads[0].resolve([row()]));
    act(() => runtime.streams[0].receive([row()]));
    expect(hook.result.current.entries[0].conversation_id).toBe('new-session');
  });
  it('accepts an empty subscription after the final conversation leaves', () => {
    const hook = renderHook(() => useDmInboxProjection(runtime.viewer));
    act(() => runtime.streams[0].receive([row()]));
    act(() => runtime.streams[0].receive([]));
    expect(hook.result.current.entries).toEqual([]);
    expect(hook.result.current.projectionReady).toBe(true);
  });
  it('does not overwrite a fresh subscription with a late initial fetch', async () => {
    const hook = renderHook(() => useDmInboxProjection(runtime.viewer));
    act(() => runtime.streams[0].receive([row('alice-profile', 'fresh')]));
    await act(async () => runtime.loads[0].resolve([row('alice-profile', 'stale')]));
    expect(hook.result.current.entries[0].conversation_id).toBe('fresh');
  });
});
