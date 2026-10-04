import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MiniApps from './MiniApps';
import { MINI_APP_TEMPLATES } from '@/features/mini-apps/templates';
import type { MiniAppRecord, MiniAppSource } from '@/features/mini-apps/model';

const state = vi.hoisted(() => ({ uid: 'alice', reducedMotion: false, systemReducedMotion: false, sound: vi.fn(), success: vi.fn(), report: vi.fn() }));
const repository = vi.hoisted(() => ({ list: vi.fn(), save: vi.fn(), publish: vi.fn(), unpublish: vi.fn(), get: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: state.uid }, profile: { id: `${state.uid}-profile` } }) }));
vi.mock('@/hooks/useReportAccountSession', () => ({ useReportAccountSession: () => ({ uid: state.uid, epoch: 1 }) }));
vi.mock('@/lib/theme', () => ({ useTheme: () => ({ reducedMotion: state.reducedMotion }) }));
vi.mock('@/lib/firebase/firestoreDb', () => ({ getFirestoreDb: vi.fn() }));
vi.mock('@/hooks/useSafetyReport', () => ({ useSafetyReport: () => Object.assign(state.report, { sessionKey: state.uid }) }));
vi.mock('framer-motion', () => ({ useReducedMotion: () => state.systemReducedMotion }));
vi.mock('@/components/layout/AppLayout', () => ({ AppLayout: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('@/lib/haptics', () => ({ triggerHaptic: vi.fn() }));
vi.mock('@/lib/sounds', () => ({ playSound: state.sound }));
vi.mock('sonner', () => ({ toast: { success: state.success, error: vi.fn() } }));
vi.mock('@/features/mini-apps/repository', () => ({ listMiniAppsPage: repository.list, saveMiniAppDraft: repository.save, publishMiniApp: repository.publish, unpublishMiniApp: repository.unpublish, getPublishedMiniApp: repository.get }));

const record = (source: MiniAppSource, owner = 'alice'): MiniAppRecord => ({ ...source, id: 'app-1', owner_id: owner, schema_version: 1, created_at: { seconds: 1 } });

function view(client: QueryClient) { return <QueryClientProvider client={client}><MemoryRouter><MiniApps /></MemoryRouter></QueryClientProvider>; }
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return { client, ...render(view(client)) };
}

beforeEach(() => {
  state.uid = 'alice'; state.reducedMotion = false; state.systemReducedMotion = false;
  vi.clearAllMocks();
  state.report.mockReset();
  repository.list.mockResolvedValue({ apps: [], nextCursor: null });
  repository.save.mockImplementation(async (owner: string, source: MiniAppSource) => record(source, owner));
  repository.publish.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe('mini apps studio flow', () => {
  it.each(['All mini apps', 'Unpublish'])('returns to the library after opening a published studio app via %s', async action => {
    const app = record({ ...MINI_APP_TEMPLATES[0].source, title: 'Navigation QA' });
    repository.get.mockResolvedValue(app);
    repository.unpublish.mockResolvedValue(undefined);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/mini-apps']}><Routes><Route path="/mini-apps/:appId?" element={<MiniApps />} /></Routes></MemoryRouter></QueryClientProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Build a mini app' }));
    fireEvent.change(screen.getByLabelText('App name'), { target: { value: app.title } });
    fireEvent.click(screen.getByRole('button', { name: 'Publish to Hub' }));
    fireEvent.click(screen.getByRole('button', { name: 'Publish app' }));
    fireEvent.click(await screen.findByRole('link', { name: 'Open published app' }));
    await screen.findByRole('heading', { name: app.title });
    fireEvent.click(screen.getByRole('button', { name: action, exact: true }));
    if (action === 'Unpublish') {
      fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Unpublish', exact: true }));
      await waitFor(() => expect(repository.unpublish).toHaveBeenCalledWith('alice', expect.objectContaining({ id: app.id })));
    }
    expect(await screen.findByRole('button', { name: 'Build a mini app' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'App name' })).not.toBeInTheDocument();
  });

  it('keeps searching across loaded pages and offers retry without dropping earlier apps', async () => {
    const one = { ...record(MINI_APP_TEMPLATES[0].source), id: 'one', title: 'First creation' };
    const two = { ...one, id: 'two', title: 'Hidden gem' };
    repository.list.mockResolvedValueOnce({ apps: [one], nextCursor: 'one' }).mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce({ apps: [two], nextCursor: null });
    mount(); await screen.findByText('First creation');
    fireEvent.change(screen.getByRole('textbox', { name: 'Search mini apps' }), { target: { value: 'Hidden gem' } });
    expect(screen.getByText('No matches in loaded apps')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load more apps' }));
    await screen.findByRole('button', { name: 'Retry loading more' });
    expect(screen.getByText('No matches in loaded apps')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading more' }));
    await screen.findByText('Hidden gem');
    expect(screen.queryByRole('button', { name: 'Load more apps' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search mini apps' }), { target: { value: '' } });
    expect(screen.getByText('First creation')).toBeInTheDocument();
    expect(repository.list).toHaveBeenLastCalledWith('alice', 'published', 'one');
  });
  it('previews only after Run, saves privately, and publishes only after confirmation', async () => {
    const { container } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Build a mini app' }));
    fireEvent.change(screen.getByLabelText('App name'), { target: { value: 'My small game' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(container.querySelector('iframe')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Run app' }));
    expect(container.querySelector('iframe')?.getAttribute('sandbox')).toBe('allow-scripts');
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(container.querySelector('iframe')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(screen.getByText('Private draft saved')).toBeInTheDocument());
    expect(repository.save).toHaveBeenCalledWith('alice', expect.objectContaining({ title: 'My small game' }), null, expect.any(String));
    expect(repository.publish).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Publish to Hub' }));
    expect(repository.publish).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Publish app' }));
    await waitFor(() => expect(repository.publish).toHaveBeenCalledWith('alice', expect.objectContaining({ title: 'My small game', owner_id: 'alice' }), expect.objectContaining({ requestId: expect.any(String) })));
    expect(await screen.findByRole('link', { name: 'Open published app' })).toHaveAttribute('href', '/mini-apps/app-1');
    expect(state.sound).toHaveBeenCalledWith('success');
  });
  it('tears down private source and a running iframe when the account changes', () => {
    const { client, container, rerender } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Build a mini app' }));
    fireEvent.change(screen.getByLabelText('App name'), { target: { value: 'Alice private invention' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    fireEvent.click(screen.getByRole('button', { name: 'Run app' }));
    expect(container.querySelector('iframe')).not.toBeNull();
    state.uid = 'bob';
    rerender(view(client));
    expect(container.querySelector('iframe')).toBeNull();
    expect(screen.queryByDisplayValue('Alice private invention')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Build a mini app' }));
    expect(screen.getByLabelText('App name')).toHaveValue(MINI_APP_TEMPLATES[0].source.title);
  });
  it('recovers unsaved code after leaving and reopening for the same account', () => {
    const first = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Build a mini app' }));
    fireEvent.change(screen.getByLabelText('App name'), { target: { value: 'Recovered after navigation' } });
    first.unmount();
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Build a mini app' }));
    expect(screen.getByLabelText('App name')).toHaveValue('Recovered after navigation');
  });
  it('does not finish publication after the account changes during draft save', async () => {
    let finishSave: (value: MiniAppRecord) => void = () => {};
    repository.save.mockReturnValue(new Promise<MiniAppRecord>(resolve => { finishSave = resolve; }));
    const { client, rerender } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Build a mini app' }));
    fireEvent.click(screen.getByRole('button', { name: 'Publish to Hub' }));
    fireEvent.click(screen.getByRole('button', { name: 'Publish app' }));
    await waitFor(() => expect(repository.save).toHaveBeenCalled());
    state.uid = 'bob';
    rerender(view(client));
    finishSave(record(MINI_APP_TEMPLATES[0].source));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Build a mini app' })).toBeInTheDocument());
    expect(repository.publish).not.toHaveBeenCalled();
  });
  it('passes the in-app reduced motion preference into the mini app', () => {
    state.reducedMotion = true;
    const { container } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Build a mini app' }));
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    fireEvent.click(screen.getByRole('button', { name: 'Run app' }));
    expect(container.querySelector('iframe')?.srcdoc).toContain('document.head.appendChild(motion)');
    fireEvent.click(screen.getByRole('button', { name: 'Phone', exact: true }));
    expect(container.querySelector('iframe')?.parentElement).toHaveStyle({ transition: 'none' });
  });
  it('stops the old preview and explicitly loads updated code before running it', () => {
    const { container } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Build a mini app' }));
    fireEvent.click(screen.getByRole('button', { name: 'Preview', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Run app' }));
    fireEvent.change(screen.getByLabelText('HTML code'), { target: { value: '<main>My updated app</main>' } });
    expect(screen.getByText('Your code has changed. Update preview to load the latest version.')).toBeInTheDocument();
    expect(container.querySelector('iframe')?.srcdoc).not.toContain('My updated app');
    fireEvent.click(screen.getByRole('button', { name: 'Update preview' }));
    expect(container.querySelector('iframe')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Run app' }));
    expect(container.querySelector('iframe')?.srcdoc).toContain('My updated app');
  });
  it('preserves code and the pending identity across a failed save, navigation and retry', async () => {
    repository.save.mockRejectedValueOnce(new Error('Response lost'));
    const first = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Build a mini app' }));
    fireEvent.change(screen.getByLabelText('HTML code'), { target: { value: '<main>Keep my code</main>' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Response lost');
    expect(screen.getByLabelText('HTML code')).toHaveValue('<main>Keep my code</main>');
    const pendingId = repository.save.mock.calls[0][3];
    first.unmount(); mount();
    fireEvent.click(screen.getByRole('button', { name: 'Build a mini app' }));
    expect(screen.getByLabelText('HTML code')).toHaveValue('<main>Keep my code</main>');
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(repository.save).toHaveBeenCalledTimes(2));
    expect(repository.save.mock.calls[1][3]).toBe(pendingId);
  });
  it('keeps a successfully saved draft when publishing fails and offers an explicit retry', async () => {
    repository.publish.mockRejectedValueOnce({ code: 'permission-denied' });
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Build a mini app' }));
    fireEvent.change(screen.getByLabelText('App name'), { target: { value: 'My retained app' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publish to Hub' }));
    fireEvent.click(screen.getByRole('button', { name: 'Publish app' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your private draft was saved, but publishing failed.');
    expect(screen.getByRole('alert')).toHaveTextContent('Publishing is blocked for this app. A moderation hold or account permissions may need review.');
    expect(screen.getByText('Private draft saved')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open published app' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('App name')).toHaveValue('My retained app');
    expect(state.sound).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry publishing' }));
    expect(await screen.findByRole('link', { name: 'Open published app' })).toBeInTheDocument();
    expect(repository.save.mock.calls[1][2]).toMatchObject({ id: 'app-1', title: 'My retained app' });
  });
  it('supports keyboard save and preview shortcuts without running code automatically', async () => {
    const { container } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Build a mini app' }));
    fireEvent.keyDown(screen.getByLabelText('HTML code'), { key: 's', ctrlKey: true });
    await screen.findByText('Private draft saved');
    fireEvent.keyDown(screen.getByLabelText('HTML code'), { key: 'Enter', metaKey: true });
    expect(screen.getByRole('button', { name: 'Run app' })).toBeInTheDocument();
    expect(container.querySelector('iframe')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Wrap code' }));
    expect(screen.getByLabelText('HTML code')).toHaveAttribute('wrap', 'off');
  });
  it.each(['app', 'system'])('respects %s reduced motion when bringing the preview into view', preference => {
    if (preference === 'app') state.reducedMotion = true; else state.systemReducedMotion = true;
    const previous = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
    const scroll = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scroll });
    try {
      mount();
      fireEvent.click(screen.getByRole('button', { name: 'Build a mini app' }));
      fireEvent.click(screen.getByRole('button', { name: 'Preview', exact: true }));
      expect(scroll).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
      expect(screen.getByText('Preview uses the code from your last update.').parentElement).toHaveFocus();
    } finally {
      if (previous) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', previous);
      else delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });
  it('does not announce an old account unpublish result in the next account', async () => {
    let finish!: () => void;
    repository.list.mockResolvedValue({ apps: [{ ...record(MINI_APP_TEMPLATES[0].source), status: 'published' }], nextCursor: null });
    repository.unpublish.mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
    const { client, rerender } = mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Unpublish', exact: true }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Unpublish', exact: true }));
    await waitFor(() => expect(repository.unpublish).toHaveBeenCalled());
    state.uid = 'bob'; rerender(view(client)); finish();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(state.success).not.toHaveBeenCalled();
  });
  it('keeps a failed report open with its selected reason and submits the same reason on retry', async () => {
    repository.get.mockResolvedValue({ ...record(MINI_APP_TEMPLATES[0].source, 'bob'), status: 'published' });
    state.report.mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValueOnce({ id: 'report-1' });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/mini-apps/app-1']}><Routes><Route path="/mini-apps/:appId" element={<MiniApps />} /></Routes></MemoryRouter></QueryClientProvider>);
    fireEvent.click(await screen.findByRole('button', { name: 'Report', exact: true }));
    const dialog = screen.getByRole('alertdialog', { name: 'Report mini app' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Spam', exact: true }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Submit Report' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Couldn’t submit your report');
    expect(within(dialog).getByRole('button', { name: 'Spam', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(within(dialog).getByRole('button', { name: 'Submit Report' })).toBeEnabled();
    expect(state.success).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Submit Report' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(state.report).toHaveBeenCalledTimes(2);
    const first = state.report.mock.calls[0][0];
    const second = state.report.mock.calls[1][0];
    expect(first).toEqual({ targetType: 'mini_app', targetId: 'app-1', reason: 'spam' });
    expect(second.reason).toBe(first.reason);
    expect(state.success).toHaveBeenCalledExactlyOnceWith('Report submitted for review.');
  });
});
