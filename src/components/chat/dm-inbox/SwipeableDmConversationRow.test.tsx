import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act, cleanup } from '@testing-library/react';
import { SwipeableDmConversationRow } from './SwipeableDmConversationRow';
import type { DMConversationPreview } from '@/features/dms/dm.types';
import type { LoadedDMConversation } from '@/lib/loadDMConversations';
import { HOLD_MS } from '@/lib/dmLongPressGesture';

vi.mock('framer-motion', async () => {
  const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
  return {
    ...actual,
    useMotionValue: (init: number) => ({ get: () => init, set: vi.fn() }),
    useTransform: () => ({ get: () => 0 }),
    animate: vi.fn(() => Promise.resolve()),
  };
});

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => true }));
vi.mock('@/lib/performanceConfig', () => ({ shouldUseListMotion: () => false }));
vi.mock('@/lib/haptics', () => ({ triggerHaptic: vi.fn() }));
vi.mock('@/hooks/useTrashedConversations', () => ({
  useTrashConversation: () => ({ mutate: vi.fn() }),
}));
vi.mock('@/hooks/useDmInboxActions', () => ({
  useDmInboxActions: () => ({
    isMuted: false,
    isPinned: false,
    togglePin: { mutate: vi.fn() },
    toggleMute: { mutate: vi.fn() },
    markUnread: { mutate: vi.fn() },
    markRead: { mutate: vi.fn() },
    toggleRead: vi.fn(),
    archive: { mutate: vi.fn() },
    toggleLock: { mutate: vi.fn() },
  }),
}));

vi.mock('@/contexts/CameraOverlayContext', () => ({
  useCameraOverlayOptional: () => ({ openCamera: vi.fn() }),
  openSnapCamera: vi.fn(),
}));

vi.mock('./DmConversationCard', () => ({
  DmConversationCard: () => (
    <div data-testid="dm-card">
      <button type="button" aria-label="Open Parker Collins's profile">
        Avatar
      </button>
      <span>Parker Collins</span>
      <button
        type="button"
        data-dm-camera-shortcut
        aria-label="Send a VYBE to Parker Collins"
        onPointerDown={(event) => event.stopPropagation()}
      >
        Camera
      </button>
    </div>
  ),
}));

const conversation = {
  id: 'conv-1',
  is_group: false,
  members: [],
  unread_count: 0,
} as LoadedDMConversation;

const preview: DMConversationPreview = {
  conversation,
  id: 'conv-1',
  conversationId: 'conv-1',
  conversationType: 'direct',
  displayName: 'Parker Collins',
  previewText: 'Hey',
  statusLine: 'Received',
  statusKind: 'received',
  deliveryStatus: 'read',
  latestMessageType: 'text',
  unreadCount: 0,
  mentionCount: 0,
  isUnread: false,
  isPinned: false,
  pinOrder: 0,
  isMuted: false,
  isArchived: false,
  needsReply: false,
  isGroup: false,
  isTyping: false,
  typingNames: [],
  isOnline: false,
  isAway: false,
  presenceState: 'offline',
  storyState: 'none',
};

function renderRow(overrides: Partial<{
  onClick: () => void;
  onOpenOptions: (p: DMConversationPreview) => void;
}> = {}) {
  const onClick = overrides.onClick ?? vi.fn();
  const onOpenOptions = overrides.onOpenOptions ?? vi.fn();
  const view = render(
    <SwipeableDmConversationRow
      conversation={conversation}
      preview={preview}
      profileId="me"
      onClick={onClick}
      onOpenOptions={onOpenOptions}
    />,
  );
  return { onClick, onOpenOptions, ...view };
}

function rowSurface(container: HTMLElement) {
  return container.querySelector('[aria-label="Open options for Parker Collins"]') as HTMLElement;
}

describe('SwipeableDmConversationRow gestures', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('quick tap opens conversation', () => {
    const { onClick, onOpenOptions, container } = renderRow();
    const row = rowSurface(container);
    fireEvent.pointerDown(row, { clientX: 10, clientY: 10, pointerId: 1, button: 0 });
    fireEvent.pointerUp(document, { clientX: 10, clientY: 10, pointerId: 1, button: 0 });
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onOpenOptions).not.toHaveBeenCalled();
  });

  it('450ms hold opens options for the correct conversation', () => {
    const { onClick, onOpenOptions, container } = renderRow();
    const row = rowSurface(container);
    fireEvent.pointerDown(row, { clientX: 20, clientY: 20, pointerId: 2, button: 0 });
    act(() => {
      vi.advanceTimersByTime(HOLD_MS);
    });
    expect(onOpenOptions).toHaveBeenCalledWith(expect.objectContaining({ id: 'conv-1' }));
    fireEvent.pointerUp(document, { clientX: 20, clientY: 20, pointerId: 2, button: 0 });
    expect(onClick).not.toHaveBeenCalled();
  });

  it('9px move during hold still opens options', () => {
    const { onOpenOptions, container } = renderRow();
    const row = rowSurface(container);
    fireEvent.pointerDown(row, { clientX: 0, clientY: 0, pointerId: 3, button: 0 });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    fireEvent.pointerMove(document, { clientX: 9, clientY: 0, pointerId: 3 });
    act(() => {
      vi.advanceTimersByTime(HOLD_MS);
    });
    expect(onOpenOptions).toHaveBeenCalled();
  });

  it('11px move cancels hold', () => {
    const { onOpenOptions, container } = renderRow();
    const row = rowSurface(container);
    fireEvent.pointerDown(row, { clientX: 0, clientY: 0, pointerId: 4, button: 0 });
    fireEvent.pointerMove(document, { clientX: 11, clientY: 0, pointerId: 4 });
    act(() => {
      vi.advanceTimersByTime(HOLD_MS);
    });
    expect(onOpenOptions).not.toHaveBeenCalled();
  });

  it('vertical movement cancels hold', () => {
    const { onOpenOptions, container } = renderRow();
    const row = rowSurface(container);
    fireEvent.pointerDown(row, { clientX: 0, clientY: 0, pointerId: 5, button: 0 });
    fireEvent.pointerMove(document, { clientX: 0, clientY: 14, pointerId: 5 });
    act(() => {
      vi.advanceTimersByTime(HOLD_MS);
    });
    expect(onOpenOptions).not.toHaveBeenCalled();
  });

  it('horizontal swipe cancels hold', () => {
    const { onOpenOptions, container } = renderRow();
    const row = rowSurface(container);
    fireEvent.pointerDown(row, { clientX: 0, clientY: 0, pointerId: 6, button: 0 });
    fireEvent.pointerMove(document, { clientX: 20, clientY: 0, pointerId: 6 });
    act(() => {
      vi.advanceTimersByTime(HOLD_MS);
    });
    expect(onOpenOptions).not.toHaveBeenCalled();
  });

  it('pointer cancel cancels hold', () => {
    const { onOpenOptions, container } = renderRow();
    const row = rowSurface(container);
    fireEvent.pointerDown(row, { clientX: 0, clientY: 0, pointerId: 7, button: 0 });
    fireEvent.pointerCancel(document, { pointerId: 7 });
    act(() => {
      vi.advanceTimersByTime(HOLD_MS);
    });
    expect(onOpenOptions).not.toHaveBeenCalled();
  });

  it('camera button tap does not open options sheet', () => {
    const { onOpenOptions, container } = renderRow();
    const camera = container.querySelector('[data-dm-camera-shortcut]') as HTMLElement;
    fireEvent.pointerDown(camera, { clientX: 0, clientY: 0, pointerId: 8, button: 0 });
    act(() => {
      vi.advanceTimersByTime(HOLD_MS);
    });
    fireEvent.click(camera);
    expect(onOpenOptions).not.toHaveBeenCalled();
  });

  it('hold on avatar area opens options (regression)', () => {
    const { onOpenOptions, container } = renderRow();
    const avatar = container.querySelector(
      '[aria-label="Open Parker Collins\'s profile"]',
    ) as HTMLElement;
    fireEvent.pointerDown(avatar, { clientX: 5, clientY: 5, pointerId: 9, button: 0 });
    act(() => {
      vi.advanceTimersByTime(HOLD_MS);
    });
    expect(onOpenOptions).toHaveBeenCalled();
  });
});
