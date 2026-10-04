/**
 * Post-capture flow for camera launches that carry a CameraLaunchContext:
 * Edit → (Send To when needed) → background send → return to the right screen.
 */
import { useCallback, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';
import { useConversations } from '@/hooks/useMessages';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import {
  bakeCameraEdits,
  bakedCameraFileName,
} from '@/lib/bakeCameraEdits';
import {
  allowsStoryDestinations,
  defaultDestinationForContext,
  preselectedConversationId,
  preselectedRecipientIds,
  resolveReturnRoute,
  type CameraLaunchContext,
  type SnapDestinationKind,
} from '@/lib/camera/cameraLaunchContext';
import {
  addRecipient,
  emptySelection,
  hasAnyDestination,
  recipientChipLabel,
  shouldOpenSendToScreen,
  type SnapSelection,
  type StoryDestinationId,
} from '@/lib/camera/recipientSelection';
import { createSnapDraft, type SnapViewMode } from '@/lib/camera/snapDraft';
import { startSnapSend } from '@/lib/camera/snapSendService';
import {
  globalSendConfirmationText,
  shouldStayOnCameraAfterSend,
} from '@/lib/camera/snapFlowBehavior';
import { revokeLocalUri } from '@/lib/camera/snapBlobCleanup';
import { selectionCount } from '@/lib/camera/recipientSelection';
import { SnapEditor, type SnapEditorResult } from './SnapEditor';
import { SendToScreen } from './SendToScreen';

export interface SnapCaptureFlowProps {
  media: { url: string; type: 'photo' | 'video'; file: File };
  filter: string;
  durationSec?: number | null;
  launchContext: CameraLaunchContext;
  onRetake: () => void;
  /** Close the whole camera overlay. */
  onClose: () => void;
  /** Global multi-send: reset to capture without closing the overlay. */
  onGlobalSendComplete?: () => void;
}

interface BakedMedia {
  file: File;
  url: string;
}

async function bakeEdits(
  media: SnapCaptureFlowProps['media'],
  edits: SnapEditorResult,
): Promise<BakedMedia> {
  const baked = await bakeCameraEdits(media.file, media.type, edits.overlays, edits.drawings, {
    displayWidth: edits.displayWidth,
    displayHeight: edits.displayHeight,
  });
  if (baked === media.file) return { file: media.file, url: media.url };
  const mimeType = baked.type || media.file.type;
  const file = new File([baked], bakedCameraFileName(media.type, mimeType), { type: mimeType });
  return { file, url: URL.createObjectURL(file) };
}

export function SnapCaptureFlow({
  media,
  filter,
  durationSec,
  launchContext,
  onRetake,
  onClose,
  onGlobalSendComplete,
}: SnapCaptureFlowProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useAuth();
  const profileId = useAuthProfileId();
  const { data: conversations } = useConversations();

  const destination: SnapDestinationKind = defaultDestinationForContext(launchContext);
  const [screen, setScreen] = useState<'editor' | 'send-to'>('editor');
  const [viewMode, setViewMode] = useState<SnapViewMode>('view_once');
  const [storyAudience, setStoryAudience] = useState<StoryDestinationId>('my_story');
  const [isBaking, setIsBaking] = useState(false);
  const [pendingEdits, setPendingEdits] = useState<SnapEditorResult | null>(null);

  // Preselected recipients from the launch context, resolved to display names.
  const preselected = useMemo<SnapSelection>(() => {
    let sel = emptySelection();
    const convId = preselectedConversationId(launchContext);
    if (convId) {
      const conv = conversations?.find((c) => c.id === convId);
      const other = conv?.members?.find(
        (m) => m.user_id !== profileId && m.profile?.id,
      )?.profile;
      const name = conv?.is_group
        ? conv.name || 'Group'
        : other?.display_name || other?.username || 'Chat';
      sel = addRecipient(sel, {
        id: convId,
        type: conv?.is_group ? 'group' : 'conversation',
        name,
        avatarUrl: conv?.avatar_url ?? other?.avatar_url ?? null,
        conversationId: convId,
      });
    }
    for (const pid of preselectedRecipientIds(launchContext)) {
      const conv = conversations?.find(
        (c) =>
          !c.is_group && c.members?.some((m) => m.profile?.id === pid),
      );
      const member = conv?.members?.find((m) => m.profile?.id === pid)?.profile;
      sel = addRecipient(sel, {
        id: pid,
        type: 'friend',
        name: member?.display_name || member?.username || 'Friend',
        avatarUrl: member?.avatar_url ?? null,
        conversationId: conv?.id ?? null,
      });
    }
    return sel;
    // Resolve once per capture — live conversation updates shouldn't reset edits.
  }, [launchContext]);

  const [selection, setSelection] = useState<SnapSelection>(preselected);

  const finishAndReturn = useCallback(() => {
    const route = resolveReturnRoute(launchContext);
    onClose();
    if (route && route !== location.pathname) {
      navigate(route);
    }
  }, [launchContext, location.pathname, navigate, onClose]);

  const dispatchSend = useCallback(
    (baked: BakedMedia, sel: SnapSelection) => {
      if (!profile?.id && !profileId) {
        toast.error('Sign in to send snaps');
        return;
      }
      const senderId = profileId || profile!.id;
      const authUserId = (profile as { user_id?: string } | null)?.user_id || senderId;

      const conversationIds = sel.recipients
        .filter((r) => r.conversationId)
        .map((r) => r.conversationId as string);
      const recipientIds = sel.recipients
        .filter((r) => r.type === 'friend' && !r.conversationId)
        .map((r) => r.id);

      const draft = createSnapDraft({
        localUri: baked.url,
        mediaType: media.type,
        viewMode,
        durationSec: durationSec ?? null,
        conversationIds,
        recipientIds,
        storyDestinationIds: sel.storyDestinations,
        replyToMessageId: launchContext.replyToMessageId,
      });

      try {
        startSnapSend({
        draft,
        file: baked.file,
        senderId,
        authUserId,
        senderProfile: profile
          ? {
              id: senderId,
              username: profile.username,
              display_name: profile.display_name,
              avatar_url: profile.avatar_url,
            }
          : undefined,
        });
      } catch {
        toast.error('Your account changed. Reopen the camera before sending this snap.');
        return;
      }

      if (shouldStayOnCameraAfterSend(launchContext.source)) {
        toast.success(globalSendConfirmationText(selectionCount(sel)), { duration: 2200 });
        revokeLocalUri(baked.url);
        onGlobalSendComplete?.();
        return;
      }

      finishAndReturn();
    },
    [
      profile,
      profileId,
      media.type,
      viewMode,
      durationSec,
      launchContext,
      finishAndReturn,
      onGlobalSendComplete,
    ],
  );

  const handleEditorSend = useCallback(
    async (edits: SnapEditorResult) => {
      if (isBaking) return;

      if (destination === 'post' || destination === 'clip') {
        // Create flow: hand the edited media to the existing upload composer.
        setIsBaking(true);
        try {
          const baked = await bakeEdits(media, edits);
          onClose();
          navigate('/upload', {
            state: {
              prefillMedia: { file: baked.file, url: baked.url, type: media.type },
              captureTarget: destination,
            },
          });
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Failed to save edits');
        } finally {
          setIsBaking(false);
        }
        return;
      }

      const effectiveSelection: SnapSelection =
        destination === 'story' && !hasAnyDestination(selection)
          ? { ...selection, storyDestinations: [storyAudience] }
          : selection;

      if (destination !== 'story' && shouldOpenSendToScreen(effectiveSelection)) {
        setPendingEdits(edits);
        setScreen('send-to');
        return;
      }

      setIsBaking(true);
      try {
        const baked = await bakeEdits(media, edits);
        dispatchSend(baked, effectiveSelection);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to send');
      } finally {
        setIsBaking(false);
      }
    },
    [isBaking, destination, media, selection, storyAudience, dispatchSend, navigate, onClose],
  );

  const handleSendToConfirm = useCallback(async () => {
    if (!hasAnyDestination(selection)) return;
    setScreen('editor');
    setIsBaking(true);
    try {
      const baked = await bakeEdits(media, pendingEdits ?? { overlays: [], drawings: [] });
      dispatchSend(baked, selection);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setIsBaking(false);
    }
  }, [selection, media, pendingEdits, dispatchSend]);

  const handleSaveToDevice = useCallback(
    async (edits: SnapEditorResult) => {
      try {
        const baked = await bakeEdits(media, edits);
        const a = document.createElement('a');
        a.href = baked.url;
        a.download = baked.file.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        toast.success('Saved');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to save');
      }
    },
    [media],
  );

  if (screen === 'send-to') {
    return (
      <SendToScreen
        selection={selection}
        onSelectionChange={setSelection}
        allowStories={allowsStoryDestinations(launchContext)}
        onBack={() => setScreen('editor')}
        onConfirm={() => void handleSendToConfirm()}
      />
    );
  }

  return (
    <SnapEditor
      mediaUrl={media.url}
      mediaType={media.type}
      filter={filter}
      destination={destination}
      chipLabel={recipientChipLabel(selection)}
      viewMode={viewMode}
      storyAudience={destination === 'story' ? storyAudience : null}
      isSending={isBaking}
      animateOnSend={destination === 'story' || hasAnyDestination(selection)}
      onViewModeChange={setViewMode}
      onStoryAudienceChange={(dest) => {
        setStoryAudience(dest);
      }}
      onRetake={onRetake}
      onEditRecipients={() => setScreen('send-to')}
      onClearRecipients={() => setSelection(emptySelection())}
      onSend={(edits) => void handleEditorSend(edits)}
      onSaveToDevice={handleSaveToDevice}
    />
  );
}
