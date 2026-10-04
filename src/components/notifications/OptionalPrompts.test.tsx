import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CrashReportConsent } from '@/components/error/CrashReportConsent';
import { EnablePushPrompt } from './EnablePushPrompt';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { CONSENT_KEY, getConsentState, setCrashReportConsent } from '@/lib/crashReportConsent';
import { writeDevicePreference } from '@/lib/devicePreferences';

const mocks = vi.hoisted(() => ({
  auth: { profile: { id: 'profile-a' } as { id: string } | null },
  push: { isSupported: true, isSubscribed: false, isCheckingSubscription: false, isLoading: false, permission: 'default', subscribe: vi.fn() },
  consent: vi.fn(), save: vi.fn(), nativePermission: vi.fn(), platform: { native: false },
  authListeners: new Set<() => void>(),
}));
vi.mock('@/lib/auth', async () => {
  const { useSyncExternalStore } = await import('react');
  return { useAuth: () => ({ profile: useSyncExternalStore(listener => {
    mocks.authListeners.add(listener);
    return () => { mocks.authListeners.delete(listener); };
  }, () => mocks.auth.profile) }) };
});
vi.mock('@/hooks/usePushNotifications', () => ({ usePushNotifications: () => mocks.push }));
vi.mock('@/lib/despiaBridge', () => ({ isDespiaRuntime: () => mocks.platform.native }));
vi.mock('@/lib/despiaOneSignal', () => ({ checkDespiaPushPermission: mocks.nativePermission }));
vi.mock('@/lib/firebase', () => ({ db: {
  rpc: () => ({ single: mocks.consent }),
  from: () => ({ update: () => ({ eq: mocks.save }) }),
} }));

function Prompts({ other = false }: { other?: boolean }) {
  return <>
    {other && <Dialog open><DialogContent><DialogTitle>Finish your current task</DialogTitle><DialogDescription>This dialog already has focus.</DialogDescription></DialogContent></Dialog>}
    <CrashReportConsent /><EnablePushPrompt />
  </>;
}

const tick = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
const switchProfile = (profile: { id: string } | null) => act(() => {
  mocks.auth.profile = profile;
  mocks.authListeners.forEach(listener => listener());
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.auth.profile = { id: 'profile-a' };
  mocks.platform.native = false;
  Object.assign(mocks.push, { isSupported: true, isSubscribed: false, isCheckingSubscription: false, isLoading: false, permission: 'default' });
  mocks.push.subscribe.mockResolvedValue(true);
  mocks.consent.mockResolvedValue({ data: { crash_consent: null } });
  mocks.save.mockResolvedValue({ error: null });
  mocks.nativePermission.mockResolvedValue(false);
  writeDevicePreference(CONSENT_KEY, null);
  writeDevicePreference('vybe_push_prompt_snoozed_until', null);
  writeDevicePreference('vybe_push_prompt_disabled', null);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('optional prompt coordination', () => {
  it('shows crash consent first and opens push only after an explicit choice', async () => {
    render(<Prompts />);
    await tick(3100);
    expect(screen.getByRole('alertdialog', { name: 'Help improve VYBE' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.querySelectorAll('[role="dialog"], [role="alertdialog"]')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'No thanks' }));
    await tick(1);
    expect(getConsentState()).toBe(false);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Turn on notifications' })).toBeInTheDocument();
    expect(document.querySelectorAll('[role="dialog"], [role="alertdialog"]')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    await tick(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(mocks.push.subscribe).not.toHaveBeenCalled();
  });

  it('uses an existing remote consent choice without showing a redundant prompt', async () => {
    mocks.consent.mockResolvedValue({ data: { crash_consent: true } });
    render(<Prompts />);
    await tick(3100);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Turn on notifications' })).toBeInTheDocument();
  });

  it('queues both prompts behind an existing dialog and resumes in priority order', async () => {
    const { rerender } = render(<Prompts other />);
    await tick(3100);
    expect(screen.getByRole('dialog', { name: 'Finish your current task' })).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    rerender(<Prompts />);
    await tick(1);
    expect(screen.getByRole('alertdialog', { name: 'Help improve VYBE' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('suspends push behind a newly opened dialog without recording a dismissal', async () => {
    setCrashReportConsent(false);
    const { rerender } = render(<Prompts />);
    await tick(3100);
    expect(screen.getByRole('dialog', { name: 'Turn on notifications' })).toBeInTheDocument();
    rerender(<Prompts other />);
    await tick(1);
    expect(screen.queryByRole('dialog', { name: 'Turn on notifications' })).toBeNull();
    expect(localStorage.getItem('vybe_push_prompt_snoozed_until')).toBeNull();
    rerender(<Prompts />);
    await tick(1);
    expect(screen.getByRole('dialog', { name: 'Turn on notifications' })).toBeInTheDocument();
  });

  it('retains the choice and advances the queue when browser storage or remote sync fails', async () => {
    mocks.save.mockRejectedValue(new Error('Offline'));
    const { rerender } = render(<Prompts />);
    await tick(3100);
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('Storage full'); });
    fireEvent.click(screen.getByRole('button', { name: 'No thanks' }));
    await tick(1);
    expect(getConsentState()).toBe(false);
    expect(screen.getByRole('dialog', { name: 'Turn on notifications' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    rerender(<Prompts />);
    await tick(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('responds to a consent choice and push snooze from another tab', async () => {
    render(<Prompts />);
    await tick(3100);
    act(() => {
      localStorage.setItem(CONSENT_KEY, 'false');
      window.dispatchEvent(new StorageEvent('storage', { key: CONSENT_KEY }));
    });
    await tick(1);
    expect(screen.getByRole('dialog', { name: 'Turn on notifications' })).toBeInTheDocument();
    act(() => {
      localStorage.setItem('vybe_push_prompt_disabled', '1');
      window.dispatchEvent(new StorageEvent('storage', { key: 'vybe_push_prompt_disabled' }));
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('ignores an old account consent lookup after switching profiles', async () => {
    let resolveOld!: (value: unknown) => void;
    mocks.consent.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }));
    const { rerender } = render(<Prompts />);
    switchProfile({ id: 'profile-b' });
    rerender(<Prompts />);
    await act(async () => { resolveOld({ data: { crash_consent: true } }); });
    await tick(3100);
    expect(getConsentState()).toBeNull();
    expect(screen.getByRole('alertdialog', { name: 'Help improve VYBE' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('never overwrites a new local consent choice with an older remote lookup', async () => {
    let resolveOld!: (value: unknown) => void;
    mocks.consent.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }));
    render(<Prompts />);
    act(() => setCrashReportConsent(false));
    await act(async () => { resolveOld({ data: { crash_consent: true } }); });
    await tick(3100);
    expect(getConsentState()).toBe(false);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Turn on notifications' })).toBeInTheDocument();
  });

  it('does not display either optional prompt after signing out', async () => {
    const { rerender } = render(<Prompts />);
    await tick(3100);
    switchProfile(null);
    rerender(<Prompts />);
    await tick(4000);
    expect(document.querySelectorAll('[role="dialog"], [role="alertdialog"]')).toHaveLength(0);
  });

  it('ignores native permission results from a previous account', async () => {
    setCrashReportConsent(false);
    mocks.platform.native = true;
    let resolveOld!: (enabled: boolean) => void;
    mocks.nativePermission.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }));
    render(<Prompts />);
    await tick(1600);
    expect(screen.queryByRole('dialog')).toBeNull();
    switchProfile({ id: 'profile-b' });
    await act(async () => { resolveOld(true); });
    await tick(1600);
    expect(localStorage.getItem('vybe_push_prompt_disabled')).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Turn on notifications' })).toBeInTheDocument();
  });

  it('does not apply a pending enable result after an account switch', async () => {
    setCrashReportConsent(false);
    let resolveEnabled!: (enabled: boolean) => void;
    mocks.push.subscribe.mockReturnValueOnce(new Promise(resolve => { resolveEnabled = resolve; }));
    render(<Prompts />);
    await tick(3100);
    fireEvent.click(screen.getByRole('button', { name: 'Enable notifications' }));
    switchProfile({ id: 'profile-b' });
    await act(async () => { resolveEnabled(true); });
    await tick(3100);
    expect(localStorage.getItem('vybe_push_prompt_disabled')).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Turn on notifications' })).toBeInTheDocument();
  });
});
