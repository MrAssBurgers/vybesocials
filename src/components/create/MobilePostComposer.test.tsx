import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ enqueue: vi.fn(), clear: vi.fn(), navigate: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: 'alice' }, profile: { id: 'profile-a', user_id: 'alice' } }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => state.navigate }));
vi.mock('@/lib/uploadQueue', () => ({ enqueuePostUpload: state.enqueue }));
vi.mock('@/lib/postPublishNavigation', () => ({ applyPostPublishNavigation: () => '/home' }));
vi.mock('@/lib/haptics', () => ({ triggerHaptic: vi.fn() }));
vi.mock('@/hooks/useComposerDraft', () => ({ useComposerDraft: () => ({ stage: () => {}, existingDraft: null, clear: state.clear }) }));
vi.mock('@/components/create/DraftBanner', () => ({ DraftBanner: () => null }));
vi.mock('@/components/ai/AICaptionGenerator', () => ({ AICaptionGenerator: () => null }));
vi.mock('@/components/ai/AIPhotoEnhancer', () => ({ AIPhotoEnhancer: () => null }));
vi.mock('@/components/ui/StyledUsername', () => ({ StyledUsername: () => <span>Alice</span> }));
vi.mock('@/features/profile/components/PersonTagPicker', () => ({ PersonTagPicker: () => null }));
vi.mock('sonner', () => ({ toast: { message: vi.fn(), error: state.error } }));
import { MobilePostComposer } from './MobilePostComposer';
function mount() { const close = vi.fn(); render(<MobilePostComposer files={[]} previews={[]} contentType="text" initialCaption="My draft" onBack={() => {}} onClose={close} />); return close; }
beforeEach(() => { vi.clearAllMocks(); state.enqueue.mockReset(); }); afterEach(cleanup);
describe('mobile publisher audience and queue confirmation', () => {
  it.each([['Only me', 'only_me'], ['Followers', 'followers']])('carries the selected %s audience to the retained publication', (label, visibility) => {
    mount(); fireEvent.click(screen.getByRole('button', { name: /Everyone/ })); fireEvent.click(screen.getByRole('button', { name: label }));
    fireEvent.click(screen.getByRole('button', { name: 'Post' }));
    expect(state.enqueue).toHaveBeenCalledWith(expect.objectContaining({ visibility, profile: { id: 'profile-a', user_id: 'alice' }, caption: 'My draft' }), 'My draft');
  });
  it('keeps the original draft and view open if the account-bound queue refuses to start', () => {
    state.enqueue.mockImplementationOnce(() => { throw new Error('Account changed'); }); const close = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Post' }));
    expect(state.clear).not.toHaveBeenCalled(); expect(state.navigate).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('My draft')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Post' })); expect(state.enqueue).toHaveBeenCalledTimes(2); expect(state.clear).toHaveBeenCalledOnce();
  });
  it('enqueues one publication for repeated submit clicks', () => {
    mount(); fireEvent.click(screen.getByRole('button', { name: 'Post' })); fireEvent.click(screen.getByRole('button', { name: 'Post' }));
    expect(state.enqueue).toHaveBeenCalledOnce();
  });
});
