import { useEffect, useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AppLayout } from './AppLayout';

const state = vi.hoisted(() => ({ desktop: true, unmounted: vi.fn() }));
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
vi.mock('@/lib/navVisibility', () => ({ navVisibility: { subscribeEffective: () => () => {}, setInDesigner: () => {} } }));
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
});
