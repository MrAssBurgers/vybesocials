import { useCallback, useMemo, useState, type ElementType } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Archive,
  Ban,
  Bell,
  BellOff,
  Camera,
  ChevronRight,
  Flag,
  Mail,
  MailOpen,
  MapPin,
  MessageCircle,
  Palette,
  Phone,
  Pin,
  PinOff,
  Lock,
  Unlock,
  QrCode,
  Share2,
  Trash2,
  UserRound,
  Users,
  Video,
} from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback, ProfileAvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { PersonalQRCode } from '@/components/invite/PersonalQRCode';
import { FriendshipCard } from '@/components/friend-profile/FriendshipCard';
import { MutualFriendsDisplay } from '@/components/profile/MutualFriendsDisplay';
import { DMSettingsSheetControlled } from '@/components/chat/DMSettingsSheetControlled';
import { ConversationNotificationSheet } from '@/components/chat/ConversationNotificationSheet';
import { CreateGroupDialog } from '@/components/chat/CreateGroupDialog';
import { useTrashConversation } from '@/hooks/useTrashedConversations';
import { useCallStore } from '@/lib/callStore';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { openSnapCamera } from '@/contexts/cameraOverlayActions';
import { useCameraOverlayOptional } from '@/contexts/cameraOverlaySafe';
import { invalidateConversationCaches } from '@/lib/invalidateConversationCaches';
import { useQueryClient } from '@tanstack/react-query';
import { triggerHaptic } from '@/lib/haptics';
import { buildProfileShareUrl } from '@/lib/shareLinks';
import { useFriendshipPair } from '@/hooks/useFriendshipPair';
import { useSharedWithFriend } from '@/hooks/useSharedWithFriend';
import { useLocationShareWithFriend } from '@/hooks/useLocationShareWithFriend';
import { useSheetBackStack } from '@/hooks/useSheetBackStack';
import { conversationActionState } from '@/lib/conversationActionModel';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { blockUserAndNotifyModeration } from '@/lib/blockUserSafety';

const REPORT_REASONS = [
  ['spam', 'Spam'],
  ['harassment', 'Harassment'],
  ['inappropriate', 'Inappropriate content'],
  ['impersonation', 'Impersonation'],
  ['other', 'Other'],
] as const;

interface ConversationOptionsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  otherUserId?: string;
  otherUsername?: string;
  otherDisplayName?: string;
  otherAvatarUrl?: string;
  isMuted?: boolean;
  isPinned?: boolean;
  isUnread?: boolean;
  isLocked?: boolean;
  isGroup?: boolean;
  isOnline?: boolean;
  relationshipLabel?: string;
  onMarkUnread?: () => void;
  onMarkRead?: () => void;
  onArchive?: () => void;
  onTogglePin?: () => void;
  onToggleMute?: () => void;
  onToggleLock?: () => void;
}

function ActionRow({
  icon: Icon,
  label,
  subtitle,
  trailing = 'chevron',
  destructive,
  disabled,
  onClick,
}: {
  icon: ElementType;
  label: string;
  subtitle?: string;
  trailing?: 'chevron' | 'toggle' | 'none';
  destructive?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        'flex min-h-14 w-full items-center gap-3 border-b border-border/50 px-4 text-left transition-colors last:border-0',
        destructive
          ? 'text-destructive hover:bg-destructive/8'
          : 'text-foreground hover:bg-primary/8',
        disabled && 'cursor-not-allowed opacity-45',
      )}
      disabled={disabled}
      onClick={onClick}
      aria-label={subtitle ? `${label}. ${subtitle}` : label}
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium">{label}</span>
        {subtitle && (
          <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
        )}
      </span>
      {trailing === 'chevron' && <ChevronRight className="h-4 w-4 opacity-55" aria-hidden />}
      {trailing === 'toggle' && (
        <span className="h-5 w-9 rounded-full bg-primary/25 p-0.5" aria-hidden>
          <span className="block h-4 w-4 translate-x-4 rounded-full bg-primary" />
        </span>
      )}
    </button>
  );
}

function QuickAction({
  icon: Icon,
  label,
  disabled,
  onClick,
}: {
  icon: ElementType;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="flex min-w-0 flex-1 flex-col items-center gap-2 rounded-2xl border border-primary/15 bg-primary/8 px-1 py-3 text-center transition-transform active:scale-95 disabled:opacity-40"
      disabled={disabled}
      onClick={onClick}
      aria-label={disabled ? `${label}, unavailable` : label}
    >
      <span className="grid h-10 w-10 place-items-center rounded-2xl bg-primary/15 text-primary shadow-[0_0_18px_hsl(var(--primary)/0.2)]">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span className="text-[11px] font-semibold leading-tight">{label}</span>
    </button>
  );
}

function FriendshipDetails({
  otherUserId,
  isPinned,
  relationshipLabel,
  onManageLocation,
}: {
  otherUserId: string;
  isPinned: boolean;
  relationshipLabel: string;
  onManageLocation: () => void;
}) {
  const { data: pair } = useFriendshipPair(otherUserId);
  const { data: shared = [] } = useSharedWithFriend(otherUserId);
  const location = useLocationShareWithFriend(otherUserId);
  const metrics = [
    ['Best-friend status', relationshipLabel],
    ['Shared media', String(shared.length || pair?.shared_clip_count || 0)],
    ['Saved messages', String(pair?.saved_memory_count || 0)],
    ['Recent calls', String(pair?.call_count || 0)],
    ['Location sharing', location.isActive ? 'On' : 'Off'],
    ['Pinned', isPinned ? 'Yes' : 'No'],
  ];

  return (
    <>
      <FriendshipCard otherProfileId={otherUserId} />
      <div className="mt-3 overflow-hidden rounded-2xl border border-border/60 bg-card/25">
        {metrics.map(([label, value]) => (
          <div
            key={label}
            className="flex min-h-12 items-center justify-between gap-4 border-b border-border/50 px-4 last:border-0"
          >
            <span className="text-sm font-medium">{label}</span>
            <span className="text-sm text-muted-foreground">{value}</span>
          </div>
        ))}
      </div>
      <MutualFriendsDisplay targetUserId={otherUserId} className="mt-3" />
      <Button variant="secondary" className="mt-3 w-full" onClick={onManageLocation}>
        <MapPin className="mr-2 h-4 w-4" />
        Manage Location Sharing
      </Button>
    </>
  );
}

export function ConversationOptionsSheet({
  open,
  onOpenChange,
  conversationId,
  otherUserId,
  otherUsername,
  otherDisplayName,
  otherAvatarUrl,
  isMuted = false,
  isPinned = false,
  isUnread = false,
  isLocked = false,
  isGroup = false,
  isOnline = false,
  relationshipLabel = 'Friends',
  onMarkUnread,
  onMarkRead,
  onArchive,
  onTogglePin,
  onToggleMute,
  onToggleLock,
}: ConversationOptionsSheetProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const camera = useCameraOverlayOptional();
  const callStore = useCallStore();
  const trashConversation = useTrashConversation();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [friendshipOpen, setFriendshipOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const displayName = otherDisplayName || otherUsername || (isGroup ? 'Group chat' : 'Friend');
  const canCall = Boolean(otherUserId && !isGroup && callStore.state.phase === 'idle');
  const actionState = conversationActionState({
    isPinned,
    isMuted,
    isUnread,
    isGroup,
    hasFriend: Boolean(otherUserId),
  });
  const profileUrl = useMemo(
    () => (otherUsername ? buildProfileShareUrl(otherUsername) : ''),
    [otherUsername],
  );

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  useSheetBackStack(open, close, `conversation-actions:${conversationId}`);
  useSheetBackStack(settingsOpen, () => setSettingsOpen(false), `chat-settings:${conversationId}`);
  useSheetBackStack(notificationsOpen, () => setNotificationsOpen(false), `chat-notifications:${conversationId}`);
  useSheetBackStack(friendshipOpen, () => setFriendshipOpen(false), `friendship:${conversationId}`);
  useSheetBackStack(groupOpen, () => setGroupOpen(false), `create-group:${conversationId}`);
  useSheetBackStack(qrOpen, () => setQrOpen(false), `profile-qr:${conversationId}`);
  useSheetBackStack(reportOpen, () => setReportOpen(false), `report:${conversationId}`);
  useSheetBackStack(deleteOpen, () => setDeleteOpen(false), `delete:${conversationId}`);
  useSheetBackStack(blockOpen, () => setBlockOpen(false), `block:${conversationId}`);

  const openChat = () => {
    close();
    navigate(`/messages/${conversationId}`);
  };

  const openProfile = () => {
    if (!otherUsername) return;
    close();
    navigate(`/u/${encodeURIComponent(otherUsername)}`, {
      state: { sharedAvatarId: otherUserId, sharedAvatarUrl: otherAvatarUrl },
    });
  };

  const sendSnap = () => {
    if (!camera || !profile?.id) {
      close();
      navigate(`/messages/${conversationId}?camera=1`);
      return;
    }
    close();
    openSnapCamera(camera.openCamera, {
      source: isGroup ? 'group' : 'conversation',
      conversationId: isGroup ? undefined : conversationId,
      groupId: isGroup ? conversationId : undefined,
      recipientIds: !isGroup && otherUserId ? [otherUserId] : undefined,
      returnRoute: window.location.pathname,
    });
  };

  const startCall = async (callType: 'audio' | 'video') => {
    if (!otherUserId || !canCall) return;
    close();
    await callStore.startCall({
      callType,
      conversationId,
      receiverId: otherUserId,
      receiverUsername: otherUsername,
      receiverDisplayName: otherDisplayName,
      receiverAvatarUrl: otherAvatarUrl,
    });
  };

  const shareProfile = async () => {
    if (!profileUrl) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: `${displayName} on VYBE`, url: profileUrl });
      } else {
        await navigator.clipboard.writeText(profileUrl);
        toast.success('Profile link copied');
      }
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') toast.error('Could not share profile');
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      await trashConversation.mutateAsync(conversationId);
      setDeleteOpen(false);
      close();
    } finally {
      setBusy(false);
    }
  };

  const handleBlock = async () => {
    if (!profile?.id || !otherUserId) return;
    setBusy(true);
    try {
      await blockUserAndNotifyModeration({
        blockerId: profile.id,
        blockedId: otherUserId,
        context: 'direct message',
      });
      invalidateConversationCaches(queryClient);
      queryClient.setQueryData<string[]>(['blocked-user-ids', profile.id], (prev) => {
        const next = new Set(prev || []);
        next.add(otherUserId);
        return Array.from(next);
      });
      await queryClient.invalidateQueries({ queryKey: ['blocked-user-ids', profile.id] });
      toast.success(`${displayName} blocked`);
      setBlockOpen(false);
      close();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not block this user');
    } finally {
      setBusy(false);
    }
  };

  const handleReport = async () => {
    if (!profile?.id || !otherUserId || !reportReason) return;
    setBusy(true);
    try {
      const { error } = await db.from('reports').insert({
        reporter_id: profile.id,
        reported_user_id: otherUserId,
        reason: reportReason,
      } as never);
      if (error) throw error;
      toast.success('Report submitted');
      setReportOpen(false);
      setReportReason(null);
      close();
    } catch {
      toast.error('Could not submit report');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Drawer
        open={open}
        onOpenChange={(next) => {
          onOpenChange(next);
          if (next) triggerHaptic('medium');
        }}
        shouldScaleBackground={false}
      >
        <DrawerContent className="max-h-[92dvh] border-primary/20 bg-background/95 shadow-[0_-18px_60px_hsl(var(--primary)/0.2)] backdrop-blur-2xl">
          <div className="mx-auto mt-2 h-1.5 w-11 rounded-full bg-muted-foreground/30" aria-hidden />
          <DrawerHeader className="sr-only">
            <DrawerTitle>Conversation actions for {displayName}</DrawerTitle>
            <DrawerDescription>Quick communication and relationship settings</DrawerDescription>
          </DrawerHeader>

          <div className="overflow-y-auto overscroll-contain pb-4">
            <button
              type="button"
              className="flex w-full items-center gap-4 px-5 pb-4 pt-3 text-left"
              onClick={openProfile}
              disabled={isGroup || !otherUsername}
              aria-label={isGroup ? displayName : `Open ${displayName}'s profile`}
            >
              <span className="relative shrink-0">
                <span className="absolute -inset-1 rounded-full bg-gradient-to-br from-primary to-accent opacity-75 blur-sm" />
                <Avatar className="relative h-16 w-16 border-2 border-background">
                  <ProfileAvatarImage profileId={otherUserId} src={otherAvatarUrl} />
                  <AvatarFallback className="text-xl font-bold">
                    {displayName[0]?.toUpperCase() || '?'}
                  </AvatarFallback>
                </Avatar>
                {isOnline && (
                  <span className="absolute bottom-0 right-0 h-4 w-4 rounded-full border-2 border-background bg-emerald-500 shadow-[0_0_10px_rgb(16_185_129/0.8)]" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-lg font-bold">{displayName}</span>
                <span className="block truncate text-sm text-muted-foreground">
                  {otherUsername ? `@${otherUsername}` : relationshipLabel}
                </span>
                {!isGroup && (
                  <span className="mt-1 inline-flex rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    {relationshipLabel}
                  </span>
                )}
              </span>
              {!isGroup && <ChevronRight className="h-5 w-5 text-muted-foreground" />}
            </button>

            <div className="grid grid-cols-4 gap-2 px-4 pb-4">
              <QuickAction icon={Camera} label="VYBE Snap" onClick={sendSnap} />
              <QuickAction icon={MessageCircle} label="Chat" onClick={openChat} />
              <QuickAction icon={Video} label="Video Call" disabled={!canCall} onClick={() => void startCall('video')} />
              <QuickAction icon={Phone} label="Voice Call" disabled={!canCall} onClick={() => void startCall('audio')} />
            </div>
            {!canCall && !isGroup && (
              <p className="-mt-2 px-5 pb-3 text-center text-[11px] text-muted-foreground">
                Calls are unavailable while another call is active.
              </p>
            )}

            <div className="border-y border-border/60 bg-card/25">
              <ActionRow
                icon={isPinned ? PinOff : Pin}
                label={actionState.pinLabel}
                trailing="none"
                onClick={() => { onTogglePin?.(); close(); }}
              />
              <ActionRow
                icon={isMuted ? Bell : BellOff}
                label={actionState.muteLabel}
                trailing="none"
                onClick={() => { onToggleMute?.(); close(); }}
              />
              <ActionRow
                icon={isUnread ? MailOpen : Mail}
                label={actionState.readLabel}
                trailing="none"
                onClick={() => {
                  if (isUnread) onMarkRead?.();
                  else onMarkUnread?.();
                  close();
                }}
              />
              {onToggleLock && (
                <ActionRow
                  icon={isLocked ? Unlock : Lock}
                  label={isLocked ? 'Unlock Chat' : 'Lock Chat'}
                  trailing="none"
                  onClick={() => {
                    onToggleLock();
                    close();
                  }}
                />
              )}
              <ActionRow
                icon={Bell}
                label="Notification Settings"
                onClick={() => setNotificationsOpen(true)}
              />
              <ActionRow icon={Palette} label="Chat Settings" onClick={() => setSettingsOpen(true)} />
              {actionState.showCreateGroup && otherUserId && (
                <ActionRow icon={Users} label={`Create Group With ${displayName}`} onClick={() => setGroupOpen(true)} />
              )}
              {actionState.showFriendActions && otherUserId && (
                <ActionRow icon={UserRound} label="View Friendship" onClick={() => setFriendshipOpen(true)} />
              )}
              {actionState.showLocation && (
                <ActionRow
                  icon={MapPin}
                  label="Location Sharing"
                  onClick={() => { close(); navigate(`/messages/${conversationId}?location=1`); }}
                />
              )}
              {!isGroup && otherUsername && (
                <ActionRow icon={Share2} label="Share Profile" onClick={() => void shareProfile()} />
              )}
              {!isGroup && otherUsername && (
                <ActionRow icon={QrCode} label="Show Profile QR" onClick={() => setQrOpen(true)} />
              )}
              <ActionRow
                icon={Archive}
                label="Archive Conversation"
                trailing="none"
                onClick={() => { onArchive?.(); close(); }}
              />
            </div>

            <div className="mt-3 border-y border-destructive/15 bg-destructive/[0.025]">
              <ActionRow icon={Trash2} label="Delete Conversation" destructive onClick={() => setDeleteOpen(true)} />
              {!isGroup && otherUserId && (
                <>
                  <ActionRow icon={Ban} label="Block" destructive onClick={() => setBlockOpen(true)} />
                  <ActionRow icon={Flag} label="Report" destructive onClick={() => setReportOpen(true)} />
                </>
              )}
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      <DMSettingsSheetControlled
        conversationId={conversationId}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
      <ConversationNotificationSheet
        conversationId={conversationId}
        open={notificationsOpen}
        onOpenChange={setNotificationsOpen}
      />
      <CreateGroupDialog
        open={groupOpen}
        onOpenChange={setGroupOpen}
        initialMemberIds={otherUserId ? [otherUserId] : []}
        onSuccess={(id) => navigate(`/messages/${id}`)}
      />

      <Drawer open={friendshipOpen} onOpenChange={setFriendshipOpen} shouldScaleBackground={false}>
        <DrawerContent className="max-h-[82dvh] bg-background/95 backdrop-blur-2xl">
          <div className="mx-auto mt-2 h-1.5 w-11 rounded-full bg-muted-foreground/30" />
          <DrawerHeader>
            <DrawerTitle>Your friendship with {displayName}</DrawerTitle>
            <DrawerDescription>Private details shared between you</DrawerDescription>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-6">
            {otherUserId && (
              <FriendshipDetails
                otherUserId={otherUserId}
                isPinned={isPinned}
                relationshipLabel={relationshipLabel}
                onManageLocation={() => {
                  setFriendshipOpen(false);
                  navigate(`/messages/${conversationId}?location=1`);
                }}
              />
            )}
          </div>
        </DrawerContent>
      </Drawer>

      <Drawer open={qrOpen} onOpenChange={setQrOpen} shouldScaleBackground={false}>
        <DrawerContent className="bg-background/95 backdrop-blur-2xl">
          <div className="mx-auto mt-2 h-1.5 w-11 rounded-full bg-muted-foreground/30" />
          <DrawerHeader className="text-center">
            <DrawerTitle>{displayName} on VYBE</DrawerTitle>
            <DrawerDescription>Scan to open this profile</DrawerDescription>
          </DrawerHeader>
          <div className="flex justify-center px-6 pb-8">
            {profileUrl && <PersonalQRCode data={profileUrl} size={220} />}
          </div>
        </DrawerContent>
      </Drawer>

      <Drawer open={reportOpen} onOpenChange={setReportOpen} shouldScaleBackground={false}>
        <DrawerContent className="bg-background/95 backdrop-blur-2xl">
          <div className="mx-auto mt-2 h-1.5 w-11 rounded-full bg-muted-foreground/30" />
          <DrawerHeader>
            <DrawerTitle>Report {displayName}</DrawerTitle>
            <DrawerDescription>Select a reason, then confirm your report.</DrawerDescription>
          </DrawerHeader>
          <div className="grid grid-cols-2 gap-2 px-4">
            {REPORT_REASONS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setReportReason(id)}
                className={cn(
                  'min-h-12 rounded-xl border p-3 text-left text-sm font-medium',
                  reportReason === id ? 'border-primary bg-primary/12' : 'border-border/60',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="p-4">
            <Button variant="destructive" className="w-full" disabled={!reportReason || busy} onClick={() => void handleReport()}>
              {busy ? 'Submitting…' : 'Confirm Report'}
            </Button>
          </div>
        </DrawerContent>
      </Drawer>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              It moves to trash for 30 days before permanent deletion.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => void handleDelete()} className="bg-destructive text-destructive-foreground">
              {busy ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={blockOpen} onOpenChange={setBlockOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Block {displayName}?</AlertDialogTitle>
            <AlertDialogDescription>
              They will not be able to find, contact, or interact with you.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => void handleBlock()} className="bg-destructive text-destructive-foreground">
              {busy ? 'Blocking…' : 'Block'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
