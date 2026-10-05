import { useEffect, useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AppLayout } from './AppLayout';

const state = vi.hoisted(() => ({ desktop: true, unmounted: vi.fn(), navChanged: null as ((visible: boolean) => void) | null }));
vi.mock('@/hooks/usePlatform', () => ({ useBreakpoint: () => ({ isDesktop: state.desktop }) }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ loading: false, user: { id: 'alice' } }) }));
vi.mock('@/lib/legacyAuthStorage', () => ({ hasStoredAuthSession: () => true }));
vi.mock('@/hooks/usePresence', () => ({ usePresence: () => {} }));
vi.mock('@/hooks/useScrollOptimization', () => ({ useScrollOptimization: () => {} }));
vi.mock('@/hooks/useScreenTime', () => ({ useScreenTimeTracker: () => {} }));
vi.mock('@/hooks/useSwipeBack', () => ({ useSwipeBack: () => ({ swipeBackHandlers: {}, swipeProgress: 0 }) }));
vi.mock('@/lib/nativePerfMode', () => ({ isNativePerfMode: () => false }));
vi.mock('@/lib/scrollHideSync', () => ({ bindAppScrollHideContainer: () => () => {} }));
vi.mock('@/lib/keyboardFocusScroll', () => ({ installKeyboardFocusScroll: () => () => {} }));
vi.mock('@/lib/navVisibility', () => ({ navVisibility: { subscribeEffective: (callback: (visible: boolean) => void) => { state.navChanged = callback; return () => {}; }, setInDesigner: () => {} } }));
vi.mock('@/hooks/useCustomTheme', () => ({ setThemePreviewLock: () => {} }));
vi.mock('@/hooks/useBottomNavMount', () => ({ useBottomNavMount: () => true }));
vi.mock('@/hooks/useNativeDocumentScrollLock', () => ({ useNativeDocumentScrollLock: () => {} }));
vi.mock('./MobileHeader', () => ({ MobileHeader: () => <header>Mobile navigation</header> }));
vi.mock('./DesktopLeftSidebar', () => ({ DesktopLeftSidebar: () => <aside>Desktop navigation</aside> }));
vi.mock('./DesktopRightSidebar', () => ({ DesktopRightSidebar: () => <aside>Recommendations</aside> }));
vi.mock('@/components/pwa/PWAInstallBanner', () => ({ PWAInstallBanner: () => null }));
vi.mock('@/components/auth/Enable2FANudge', () => ({ Enable2FANudge: () => null }));
vi.mock('@/components/music/SelfNowPlayingPill', () => ({ SelfNowPlayingPill: () => null }));

function Editor() {
  const [text, setText] = useState('Starter');
  useEffect(() => () => state.unmounted(), []);
  return <textarea aria-label="Draft" value={text} onChange={event => setText(event.target.value)} />;
}
const page = (noPadding = false) => <MemoryRouter><AppLayout noPadding={noPadding}><Editor /></AppLayout></MemoryRouter>;
afterEach(cleanup);

describe('responsive app content lifetime', () => {
  beforeEach(() => { state.desktop = true; state.unmounted.mockClear(); });
  it('retains the same editor, selection and unsaved state through both breakpoint changes', () => {
    const view = render(page());
    const editor = screen.getByRole('textbox', { name: 'Draft' }) as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: 'My unsaved app' } });
    editor.focus(); editor.setSelectionRange(3, 10);
    const main = screen.getByRole('main');
    state.desktop = false; view.rerender(page());
    expect(screen.getByText('Mobile navigation')).toBeInTheDocument();
    expect(screen.queryByText('Desktop navigation')).not.toBeInTheDocument();
    expect(screen.getByRole('main')).toBe(main);
    expect(screen.getByRole('textbox')).toBe(editor);
    expect(editor).toHaveValue('My unsaved app');
    expect(editor).toHaveFocus(); expect(editor.selectionStart).toBe(3); expect(editor.selectionEnd).toBe(10);
    state.desktop = true; view.rerender(page());
    expect(screen.getByText('Desktop navigation')).toBeInTheDocument();
    expect(screen.queryByText('Mobile navigation')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBe(editor); expect(editor).toHaveValue('My unsaved app');
    expect(state.unmounted).not.toHaveBeenCalled();
    view.unmount(); expect(state.unmounted).toHaveBeenCalledOnce();
  });
  it('keeps the mobile no-padding shell contained and removes mobile styles on desktop', () => {
    state.desktop = false;
    const view = render(page(true));
    const main = screen.getByRole('main');
    expect(main).toHaveClass('overflow-hidden', 'flex', 'min-h-0');
    expect(main.style.touchAction).toBe('manipulation');
    expect(main.style.paddingBottom).toBe('');
    expect(main.firstElementChild).toHaveClass('contents');
    state.desktop = true; view.rerender(page(true));
    expect(screen.getByRole('main')).toBe(main);
    expect(main.style.touchAction).toBe('');
    expect(main.firstElementChild).toHaveClass('h-full');
    expect(main.firstElementChild).not.toHaveClass('contents');
  });
  it('lets a full profile surface own bottom clearance without external blank space in either nav state or breakpoint', () => {
    state.desktop = false;
    const profilePage = (ownsBottom: boolean) => <MemoryRouter><AppLayout contentOwnsBottomPadding={ownsBottom}><Editor /></AppLayout></MemoryRouter>;
    const view = render(profilePage(false));
    const main = screen.getByRole('main'), editor = screen.getByRole('textbox');
    expect(main.style.paddingBottom).toBe('calc(6rem + var(--sab, env(safe-area-inset-bottom, 0px)))');
    act(() => state.navChanged?.(false));
    expect(main.style.paddingBottom).toBe('calc(1.25rem + var(--sab, env(safe-area-inset-bottom, 0px)))');
    view.rerender(profilePage(true)); expect(main.style.paddingBottom).toBe('');
    act(() => state.navChanged?.(true)); expect(main.style.paddingBottom).toBe('');
    expect(main).toHaveClass('content-with-header', 'overflow-y-auto');
    state.desktop = true; view.rerender(profilePage(true));
    expect(main.firstElementChild).toHaveClass('pt-3', 'px-2'); expect(main.firstElementChild).not.toHaveClass('py-3');
    expect(screen.getByRole('textbox')).toBe(editor);
    view.rerender(profilePage(false)); expect(main.firstElementChild).toHaveClass('py-3');
  });
});
