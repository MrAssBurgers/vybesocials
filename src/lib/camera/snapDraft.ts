/**
 * Local media draft — created once per capture *before* upload. The single
 * uploaded asset is reused for every destination, and per-conversation
 * client message ids stay deterministic so the `sendDmMessage` callable can
 * dedupe retries (idempotency).
 */

/** Media modes offered in the editor, mapped onto server-allowed view modes. */
export type SnapViewMode = 'view_once' | 'replay_once' | '24h' | 'permanent';

export const SNAP_VIEW_MODES: { id: SnapViewMode; label: string; description: string }[] = [
  { id: 'view_once', label: 'View once', description: 'Disappears after opening' },
  { id: 'replay_once', label: 'Replay', description: 'One replay allowed' },
  { id: '24h', label: 'Timed', description: 'Expires 24h after opening' },
  { id: 'permanent', label: 'Keep', description: 'Stays in chat' },
];

export type SnapUploadState = 'pending' | 'uploading' | 'uploaded' | 'failed';

export interface SnapEditorStateSummary {
  textCount: number;
  drawingCount: number;
  stickerCount: number;
  filterId?: string;
}

export interface SnapMediaDraft {
  mediaId: string;
  /** Base idempotency key — per-destination ids derive from this. */
  clientMessageId: string;
  localUri: string;
  mediaType: 'photo' | 'video';
  durationSec?: number | null;
  thumbnailUri?: string | null;
  editorState?: SnapEditorStateSummary | null;
  viewMode: SnapViewMode;
  /** Profile ids that still need a conversation resolved at send time. */
  recipientIds: string[];
  conversationIds: string[];
  storyDestinationIds: string[];
  /** Reply thread anchor when the camera was launched from a media reply. */
  replyToMessageId?: string | null;
  createdAt: number;
  uploadState: SnapUploadState;
}

export interface CreateSnapDraftInput {
  localUri: string;
  mediaType: 'photo' | 'video';
  viewMode?: SnapViewMode;
  durationSec?: number | null;
  thumbnailUri?: string | null;
  editorState?: SnapEditorStateSummary | null;
  recipientIds?: string[];
  conversationIds?: string[];
  storyDestinationIds?: string[];
  replyToMessageId?: string | null;
  /** Injectable for deterministic tests. */
  mediaId?: string;
  now?: number;
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function createSnapDraft(input: CreateSnapDraftInput): SnapMediaDraft {
  const mediaId = input.mediaId ?? newId();
  return {
    mediaId,
    clientMessageId: `snap-${mediaId}`,
    localUri: input.localUri,
    mediaType: input.mediaType,
    durationSec: input.durationSec ?? null,
    thumbnailUri: input.thumbnailUri ?? null,
    editorState: input.editorState ?? null,
    viewMode: input.viewMode ?? 'view_once',
    recipientIds: [...new Set(input.recipientIds ?? [])],
    conversationIds: [...new Set(input.conversationIds ?? [])],
    storyDestinationIds: [...new Set(input.storyDestinationIds ?? [])],
    replyToMessageId: input.replyToMessageId ?? null,
    createdAt: input.now ?? Date.now(),
    uploadState: 'pending',
  };
}

/**
 * Deterministic per-conversation idempotency key: retrying the same draft to
 * the same conversation always produces the same client_message_id, so the
 * server dedupes duplicates.
 */
export function clientMessageIdFor(
  draft: Pick<SnapMediaDraft, 'clientMessageId'>,
  conversationId: string,
): string {
  return `${draft.clientMessageId}:${conversationId}`;
}

/** Optimistic message temp id for a conversation (messages cache row). */
export function optimisticTempIdFor(
  draft: Pick<SnapMediaDraft, 'clientMessageId'>,
  conversationId: string,
): string {
  return `temp-${clientMessageIdFor(draft, conversationId)}`;
}

/** Server `view_mode` value for a draft (all four modes are server-allowed). */
export function dmViewModeForDraft(draft: Pick<SnapMediaDraft, 'viewMode'>): SnapViewMode {
  return draft.viewMode;
}
