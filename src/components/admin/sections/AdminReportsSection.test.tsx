import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReportInspection, ReportSummary } from '@/lib/reportModerationService';
import { AdminReportsSection } from './AdminReportsSection';

const state = vi.hoisted(() => ({
  uid: 'moderator-a', epoch: 1, listError: false,
  inspect: vi.fn(), action: vi.fn(), refetch: vi.fn(), success: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: state.uid } }) }));
vi.mock('@/hooks/useReportAccountSession', () => ({ useReportAccountSession: () => ({ uid: state.uid, epoch: state.epoch }) }));
vi.mock('@/hooks/useModeration', () => ({ useReports: () => ({ data: state.listError ? undefined : [report], nextCursor: null, isPending: false, isError: state.listError, isFetching: false, refetch: state.refetch }) }));
vi.mock('@/lib/firebase', () => ({ db: { from: () => ({ select: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) } }));
vi.mock('sonner', () => ({ toast: { success: state.success } }));
vi.mock('@/lib/reportModerationService', () => ({
  inspectSafetyReport: (...args: unknown[]) => state.inspect(...args),
  performReportAction: (...args: unknown[]) => state.action(...args),
  reportAccountSnapshot: () => ({ uid: state.uid, epoch: state.epoch }),
  reportAccountGuard: (uid: string) => {
    const epoch = state.epoch;
    return () => { if (!uid || uid !== state.uid || epoch !== state.epoch) throw Object.assign(new Error('Account changed'), { code: 'account-changed' }); };
  },
  isReportSessionError: (error: { code?: string }) => error?.code === 'account-changed',
}));

const report: ReportSummary = {
  id: 'report-1', verification: 'verified', targetType: 'mini_app', targetId: 'app-1',
  reporterId: 'reporter-profile', reporterUid: 'reporter', targetOwnerUid: 'creator',
  reason: 'spam', details: 'Synthetic report', status: 'pending', createdAt: '2026-10-01T12:00:00.000Z',
  reviewedAt: null, reviewedBy: null, adminNotes: '',
};
const revisionA = 'a'.repeat(64), revisionB = 'b'.repeat(64);
function inspection(extra: Partial<ReportInspection> = {}): ReportInspection {
  return {
    report: { ...report }, hold: null,
    target: { type: 'mini_app', id: 'app-1', ownerUid: 'creator', available: true, title: 'Inspected app', caption: null, revision: revisionA,
      source: { title: 'Inspected app', description: 'Read this source only', category: 'tool', html: '<iframe src="https://example.invalid"></iframe><img src=x onerror="alert(1)"><script>alert(2)</script>', css: 'body { color: red; }', javascript: 'throw new Error("must not execute");' } },
    ...extra,
  };
}
function held(revision = revisionA): ReportInspection {
  const value = inspection();
  return { ...value, report: { ...report, status: 'actioned' }, target: { ...value.target, available: false, source: undefined, revision: null }, hold: { active: true, revision, note: `Hold ${revision[0]}`, removedAt: '2026-10-01T12:30:00.000Z', releasedAt: null } };
}
const clients: QueryClient[] = [];
function view(client: QueryClient) { return <QueryClientProvider client={client}><AdminReportsSection /></QueryClientProvider>; }
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } } });
  clients.push(client);
  return { client, ...render(view(client)) };
}
async function openInspection() {
  fireEvent.click(screen.getByRole('button', { name: 'Inspect report' }));
  await screen.findByRole('textbox', { name: 'Review note' });
}
function note(value = 'Reviewed the actual source') { fireEvent.change(screen.getByRole('textbox', { name: 'Review note' }), { target: { value } }); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

beforeEach(() => {
  vi.clearAllMocks(); state.uid = 'moderator-a'; state.epoch = 1; state.listError = false;
  state.inspect.mockReset().mockResolvedValue(inspection());
  state.action.mockReset().mockResolvedValue({ success: true });
});
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); });

describe('report moderation decisions', () => {
  it('shows a bounded reported-at message snapshot as text without loading media or opening a conversation', async () => {
    const content = '<img src="https://private.invalid" onerror="alert(1)"><script>doNotRun()</script>';
    const capturedAt = '2026-10-04T12:00:00.000Z';
    state.inspect.mockResolvedValue({ report: { ...report, targetType: 'message', targetId: 'message-1' }, hold: null, target: { type: 'message', id: 'message-1', ownerUid: 'sender', available: true, title: 'Reported message', caption: null, revision: null,
      messageEvidence: { messageId: 'message-1', conversationId: 'private-conversation', senderUid: 'sender', senderProfileId: 'sender-profile', content, contentTruncated: true, messageType: 'text', mediaType: 'image', hasMedia: true, createdAt: null, editedAt: null, capturedAt } } });
    mount(); await openInspection();
    const section = screen.getByRole('region', { name: 'Reported message snapshot' });
    expect(section).toHaveTextContent(content);
    expect(section).toHaveTextContent('saved copy from when the report was submitted');
    expect(section).toHaveTextContent('first 8,000 characters');
    expect(section).toHaveTextContent('Attachment present (image). Media files are not included or loaded.');
    expect(section.querySelector('time')).toHaveAttribute('dateTime', capturedAt);
    expect(section.querySelector('a, img, video, audio, iframe, script')).toBeNull();
    expect(section).not.toHaveTextContent('private-conversation');
    expect(screen.queryByRole('button', { name: 'Remove mini app' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark reviewed' })).toBeEnabled();
  });
  it('does not claim an older message lead was deleted or load private content without a verified snapshot', async () => {
    state.inspect.mockResolvedValue({ report: { ...report, targetType: 'message', targetId: 'message-1', verification: 'legacy' }, hold: null, target: { type: 'message', id: 'message-1', available: false, title: 'Reported message', caption: null, revision: null, ownerUid: null } });
    mount(); await openInspection();
    expect(screen.getByText('No verified message snapshot is available. This view does not load messages from the conversation.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Reported message snapshot' })).not.toBeInTheDocument();
  });
  it('shows authored code as escaped text without constructing active elements', async () => {
    mount(); await openInspection();
    const section = screen.getByRole('region', { name: 'Mini app source' });
    expect(section).toHaveTextContent(inspection().target.source!.html);
    expect(section).toHaveTextContent('throw new Error("must not execute")');
    expect(section.querySelector('iframe, img, script')).toBeNull();
    expect(document.querySelector('iframe')).toBeNull();
    expect(state.action).not.toHaveBeenCalled();
  });

  it('requires a note and a separate confirmation before first removal with no prior hold', async () => {
    mount(); await openInspection();
    fireEvent.click(screen.getByRole('button', { name: 'Remove mini app' }));
    expect(state.action).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Confirm removal' })).toBeDisabled();
    note('   '); expect(screen.getByRole('button', { name: 'Confirm removal' })).toBeDisabled();
    note();
    expect(state.action).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm removal' }));
    await waitFor(() => expect(state.action).toHaveBeenCalledWith({ action: 'removeMiniApp', reportId: 'report-1', expectedRevision: revisionA, note: 'Reviewed the actual source' }, expect.any(Function)));
    expect(state.action).toHaveBeenCalledTimes(1);
  });

  it('keeps the originally confirmed publication revision when inspection refreshes', async () => {
    const { client } = mount(); await openInspection(); note('Decision about version A');
    fireEvent.click(screen.getByRole('button', { name: 'Remove mini app' }));
    const next = inspection(); next.target = { ...next.target, title: 'New version B', revision: revisionB };
    state.inspect.mockResolvedValue(next);
    await act(async () => { await client.refetchQueries({ queryKey: ['report-inspection', state.uid, state.epoch, 'report-1'] }); });
    await screen.findByText('New version B');
    state.action.mockRejectedValueOnce(new Error('The mini app changed. Inspect it again.'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm removal' }));
    await waitFor(() => expect(state.action).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: revisionA }), expect.any(Function)));
    expect(await screen.findByRole('alert')).toHaveTextContent('The mini app changed');
    expect(screen.getByRole('textbox', { name: 'Review note' })).toHaveValue('Decision about version A');
    expect(state.success).not.toHaveBeenCalled();
  });

  it('keeps the originally confirmed hold revision when a newer hold appears', async () => {
    state.inspect.mockResolvedValue(held());
    const { client } = mount(); await openInspection(); note('Decision about hold A');
    fireEvent.click(screen.getByRole('button', { name: 'Release hold' }));
    expect(state.action).not.toHaveBeenCalled();
    state.inspect.mockResolvedValue(held(revisionB));
    await act(async () => { await client.refetchQueries({ queryKey: ['report-inspection', state.uid, state.epoch, 'report-1'] }); });
    await screen.findByText('Hold b');
    state.action.mockRejectedValueOnce(new Error('The moderation hold changed.'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm release' }));
    await waitFor(() => expect(state.action).toHaveBeenCalledWith({ action: 'releaseMiniApp', appId: 'app-1', expectedHoldRevision: revisionA, note: 'Decision about hold A' }, expect.any(Function)));
    expect(await screen.findByRole('alert')).toHaveTextContent('The moderation hold changed');
    expect(state.success).not.toHaveBeenCalled();
  });

  it('prevents actioned reports being downgraded and does not offer removed source execution', async () => {
    state.inspect.mockResolvedValue(held()); mount(); await openInspection();
    expect(screen.getByRole('button', { name: 'Mark reviewed' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Dismiss report' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Remove mini app' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Mini app source' })).not.toBeInTheDocument();
    expect(screen.getByText('Releasing the hold does not publish the app. The creator must publish it again.')).toBeInTheDocument();
    expect(state.action).not.toHaveBeenCalled();
  });

  it('distinguishes a failed queue from an empty queue and offers retry', async () => {
    state.listError = true; mount();
    expect(screen.getByRole('alert')).toHaveTextContent('This does not mean the queue is empty');
    expect(screen.queryByText('No reports on this page.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(state.refetch).toHaveBeenCalledTimes(1);
  });

  it('refreshes the queue and the current account report count without refreshing other accounts or unrelated counts', async () => {
    const { client } = mount();
    const current = ['pending-moderation-count', state.uid, state.epoch, 'reports'];
    const other = ['pending-moderation-count', 'moderator-b', state.epoch, 'reports'];
    const combined = ['pending-moderation-count', state.uid, state.epoch, 'moderator'];
    client.setQueryData(current, 1); client.setQueryData(other, 2); client.setQueryData(combined, 3);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh reports' }));
    expect(state.refetch).toHaveBeenCalledTimes(1);
    expect(client.getQueryState(current)?.isInvalidated).toBe(true);
    expect(client.getQueryState(other)?.isInvalidated).toBe(false);
    expect(client.getQueryState(combined)?.isInvalidated).toBe(false);
  });

  it('leaves an already loading report count alone when refreshing the queue', async () => {
    const { client } = mount();
    const current = ['pending-moderation-count', state.uid, state.epoch, 'reports'];
    const pending = deferred<number>();
    const read = vi.fn(() => pending.promise);
    const countRequest = client.fetchQuery({ queryKey: current, queryFn: read });
    expect(client.getQueryState(current)?.fetchStatus).toBe('fetching');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh reports' }));
    expect(state.refetch).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledTimes(1);
    expect(client.getQueryState(current)?.isInvalidated).toBe(false);
    await act(async () => { pending.resolve(0); await countRequest; });
    expect(client.getQueryData(current)).toBe(0);
  });

  it.each(['switch', 'aba'])('drops a late action completion after an account %s and preserves the new form', async mode => {
    const pending = deferred<{ success: true }>();
    state.action.mockReturnValueOnce(pending.promise);
    const page = mount(); await openInspection(); note('Private decision by A');
    fireEvent.click(screen.getByRole('button', { name: 'Remove mini app' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm removal' }));
    await waitFor(() => expect(state.action).toHaveBeenCalledTimes(1));
    state.uid = 'moderator-b'; state.epoch++;
    page.rerender(view(page.client));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    if (mode === 'aba') { state.uid = 'moderator-a'; state.epoch++; page.rerender(view(page.client)); }
    await openInspection(); note('New account decision');
    const invalidation = vi.spyOn(page.client, 'invalidateQueries');
    await act(async () => { pending.resolve({ success: true }); await pending.promise; });
    expect(state.success).not.toHaveBeenCalled();
    expect(invalidation).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Review note' })).toHaveValue('New account decision');
    expect(screen.getByRole('button', { name: 'Remove mini app' })).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
