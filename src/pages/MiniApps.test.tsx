import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MiniApps from './MiniApps';
import { MINI_APP_TEMPLATES } from '@/features/mini-apps/templates';
import type { MiniAppRecord, MiniAppSource } from '@/features/mini-apps/model';

const state = vi.hoisted(() => ({ uid: 'alice', reducedMotion: false }));
const repository = vi.hoisted(() => ({ list: vi.fn(), save: vi.fn(), publish: vi.fn(), unpublish: vi.fn(), get: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: state.uid }, profile: { id: `${state.uid}-profile` } }) }));
vi.mock('@/lib/theme', () => ({ useTheme: () => ({ reducedMotion: state.reducedMotion }) }));
vi.mock('@/lib/firebase/firestoreDb', () => ({ getFirestoreDb: vi.fn() }));
vi.mock('framer-motion', () => ({ useReducedMotion: () => false }));
vi.mock('@/components/layout/AppLayout', () => ({ AppLayout: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('@/lib/haptics', () => ({ triggerHaptic: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/features/mini-apps/repository', () => ({ listMiniApps: repository.list, saveMiniAppDraft: repository.save, publishMiniApp: repository.publish, unpublishMiniApp: repository.unpublish, getPublishedMiniApp: repository.get }));

const record = (source: MiniAppSource, owner = 'alice'): MiniAppRecord => ({ ...source, id: 'app-1', owner_id: owner, schema_version: 1, created_at: { seconds: 1 } });

function view(client: QueryClient) { return <QueryClientProvider client={client}><MemoryRouter><MiniApps /></MemoryRouter></QueryClientProvider>; }
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return { client, ...render(view(client)) };
}

beforeEach(() => {
  state.uid = 'alice'; state.reducedMotion = false;
  vi.clearAllMocks();
  repository.list.mockResolvedValue([]);
  repository.save.mockImplementation(async (owner: string, source: MiniAppSource) => record(source, owner));
  repository.publish.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe('mini apps studio flow', () => {
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
    expect(repository.save).toHaveBeenCalledWith('alice', expect.objectContaining({ title: 'My small game' }), null);
    expect(repository.publish).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Publish to Hub' }));
    expect(repository.publish).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Publish app' }));
    await waitFor(() => expect(repository.publish).toHaveBeenCalledWith('alice', expect.objectContaining({ title: 'My small game', owner_id: 'alice' })));
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
    expect(container.querySelector('iframe')?.srcdoc).toContain('animation: none !important');
  });
});
