import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppUpdateOverlay } from './AppUpdateOverlay';
const draft = vi.hoisted(() => vi.fn(() => false));
vi.mock('@/lib/appUpdateBridge', () => ({ hasActiveAppDraft: draft, clearAppUpdateFlag: vi.fn(), isAppUpdateInProgress: () => false }));
vi.mock('@/lib/nativePerfMode', () => ({ isNativePerfMode: () => true }));
let workers: EventTarget;
beforeEach(() => {
  vi.stubEnv('DEV', false); vi.useFakeTimers(); draft.mockReturnValue(false);
  workers = new EventTarget();
  vi.stubGlobal('navigator', { serviceWorker: workers });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
  sessionStorage.clear();
});
afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
it('a controller change alone never locks the page behind an update wall', async () => {
  render(<AppUpdateOverlay />);
  await act(async () => { workers.dispatchEvent(new Event('controllerchange')); });
  expect(screen.queryByRole('alertdialog')).toBeNull();
});
it.each(['existing', 'late'] as const)('does not show or navigate for %s drafts during a legacy worker migration', async mode => {
  if (mode === 'existing') draft.mockReturnValue(true);
  render(<AppUpdateOverlay />);
  await act(async () => { workers.dispatchEvent(new MessageEvent('message', { data: { type: 'VYBE_LEGACY_SW_TOMBSTONE' } })); });
  if (mode === 'late') draft.mockReturnValue(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(400); });
  expect(sessionStorage.getItem('vybe-update-reload-once')).toBeNull();
  expect(screen.queryByRole('alertdialog')).toBeNull();
});
it('blocked storage does not crash mount or migration and never locks the page', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked'); });
  render(<AppUpdateOverlay />);
  await act(async () => { workers.dispatchEvent(new MessageEvent('message', { data: { type: 'VYBE_LEGACY_SW_TOMBSTONE' } })); await vi.advanceTimersByTimeAsync(400); });
  expect(screen.queryByRole('alertdialog')).toBeNull();
});
it('pending migration cannot reload after unmount', async () => {
  const view = render(<AppUpdateOverlay />);
  await act(async () => { workers.dispatchEvent(new MessageEvent('message', { data: { type: 'VYBE_LEGACY_SW_TOMBSTONE' } })); });
  view.unmount(); await act(async () => { await vi.advanceTimersByTimeAsync(400); });
  expect(sessionStorage.getItem('vybe-update-reload-once')).toBeNull();
});
