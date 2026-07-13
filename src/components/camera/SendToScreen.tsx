/**
 * Send To screen — multi-select destination picker for the snap flow.
 * Sections: Recent · Best Friends · Friends · Groups · Stories (+ Search).
 * Blocked users are filtered out; public story destinations only appear when
 * the launch context permits them.
 */
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Check, Search, Send, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';
import { useFriends } from '@/hooks/useFriends';
import { useConversations } from '@/hooks/useMessages';
import { useCloseFriendIds } from '@/hooks/useCloseFriendIds';
import { useBlockedUserIds } from '@/hooks/useBlockedUsers';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { getRecentMessageUsers } from '@/lib/recentMessageUsers';
import {
  hasAnyDestination,
  hasRecipient,
  removeRecipient,
  selectionCount,
  storyDestinationLabel,
  toggleRecipient,
  toggleStoryDestination,
  type SnapRecipient,
  type SnapSelection,
  type StoryDestinationId,
} from '@/lib/camera/recipientSelection';
import { visibleStoryDestinationOptions } from '@/lib/camera/storyDestinationVisibility';

interface FriendProfile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface SendToScreenProps {
  selection: SnapSelection;
  onSelectionChange: (next: SnapSelection) => void;
  allowStories: boolean;
  onBack: () => void;
  onConfirm: () => void;
}

const STORY_OPTIONS = visibleStoryDestinationOptions();

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

function SelectRow({
  avatarUrl,
  fallback,
  title,
  subtitle,
  badge,
  selected,
  onToggle,
}: {
  avatarUrl?: string | null;
  fallback: string;
  title: string;
  subtitle?: string | null;
  badge?: string | null;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        triggerHaptic('light');
        onToggle();
      }}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
    >
      <Avatar className="h-11 w-11 shrink-0">
        {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
        <AvatarFallback>{initials(fallback)}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-foreground">{title}</span>
          {badge && (
            <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold text-primary">
              {badge}
            </span>
          )}
        </span>
        {subtitle && <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>}
      </span>
      <span
        className={cn(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
          selected
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-muted-foreground/40',
        )}
        aria-hidden
      >
        {selected && <Check className="h-3.5 w-3.5" />}
      </span>
    </button>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <p className="px-3 pb-1 pt-4 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
      {label}
    </p>
  );
}

export function SendToScreen({
  selection,
  onSelectionChange,
  allowStories,
  onBack,
  onConfirm,
}: SendToScreenProps) {
  const [query, setQuery] = useState('');
  const myProfileId = useAuthProfileId();
  const { data: friends } = useFriends();
  const { data: conversations } = useConversations();
  const { ids: closeFriendIds } = useCloseFriendIds();
  const blockedIds = useBlockedUserIds();

  const blocked = useMemo(() => new Set(blockedIds ?? []), [blockedIds]);
  const q = query.trim().toLowerCase();

  const friendList = useMemo(() => {
    const list = (friends ?? []) as FriendProfile[];
    // Map friend profile → known 1:1 conversation so send skips creation.
    const dmByProfile = new Map<string, string>();
    for (const conv of conversations ?? []) {
      if (conv.is_group) continue;
      const other = conv.members?.find(
        (m) => m.user_id !== myProfileId && m.profile?.id,
      )?.profile;
      if (other?.id) dmByProfile.set(other.id, conv.id);
    }
    return list
      .filter((f) => f?.id && !blocked.has(f.id))
      .map<SnapRecipient>((f) => ({
        id: f.id,
        type: 'friend',
        name: f.display_name || f.username,
        username: f.username,
        avatarUrl: f.avatar_url,
        conversationId: dmByProfile.get(f.id) ?? null,
      }));
  }, [friends, conversations, blocked, myProfileId]);

  const groupList = useMemo(() => {
    return (conversations ?? [])
      .filter((c) => c.is_group)
      .map<SnapRecipient>((c) => ({
        id: c.id,
        type: 'group',
        name: c.name || 'Group',
        avatarUrl: c.avatar_url,
        conversationId: c.id,
      }));
  }, [conversations]);

  const recentList = useMemo(() => {
    const byId = new Map(friendList.map((f) => [f.id, f]));
    return getRecentMessageUsers()
      .map((u) => byId.get(u.id))
      .filter((f): f is SnapRecipient => !!f)
      .slice(0, 6);
  }, [friendList]);

  const bestFriends = useMemo(
    () => friendList.filter((f) => closeFriendIds.has(f.id)),
    [friendList, closeFriendIds],
  );

  const matches = (r: SnapRecipient) =>
    !q ||
    r.name.toLowerCase().includes(q) ||
    (r.username ?? '').toLowerCase().includes(q);

  const visibleRecent = recentList.filter(matches);
  const visibleBest = bestFriends.filter(matches);
  const visibleFriends = friendList.filter(matches);
  const visibleGroups = groupList.filter(matches);

  const count = selectionCount(selection);
  const chips = [
    ...selection.recipients.map((r) => ({
      key: `${r.type}:${r.id}`,
      label: r.name,
      remove: () => onSelectionChange(removeRecipient(selection, r)),
    })),
    ...selection.storyDestinations.map((d) => ({
      key: `story:${d}`,
      label: storyDestinationLabel(d),
      remove: () => onSelectionChange(toggleStoryDestination(selection, d)),
    })),
  ];

  const rowFor = (r: SnapRecipient, badge?: string | null) => (
    <SelectRow
      key={`${r.type}:${r.id}`}
      avatarUrl={r.avatarUrl}
      fallback={r.name}
      title={r.name}
      subtitle={r.type === 'group' ? 'Group' : r.username ? `@${r.username}` : null}
      badge={badge}
      selected={hasRecipient(selection, r)}
      onToggle={() => onSelectionChange(toggleRecipient(selection, r))}
    />
  );

  return (
    <div className="fixed inset-0 z-[6200] flex flex-col bg-background">
      {/* Header */}
      <div
        className="flex items-center gap-2 border-b border-border/40 px-3 pb-2"
        style={{ paddingTop: 'calc(var(--sat, 0px) + 0.5rem)' }}
      >
        <button
          type="button"
          aria-label="Back"
          onClick={onBack}
          className="flex h-10 w-10 items-center justify-center rounded-full text-foreground hover:bg-muted/50"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h2 className="text-base font-bold text-foreground">Send To</h2>
      </div>

      {/* Search */}
      <div className="px-3 pt-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search friends and groups"
            className="rounded-full bg-muted/50 pl-9"
            spellCheck={false}
          />
        </div>
      </div>

      {/* Sections */}
      <div className="flex-1 overflow-y-auto px-1 pb-40">
        {allowStories && (
          <>
            <SectionHeader label="Stories" />
            {STORY_OPTIONS.map((opt) => (
              <SelectRow
                key={opt.id}
                fallback="ST"
                title={storyDestinationLabel(opt.id)}
                subtitle={opt.id === 'close_friends' ? 'Only your close friends' : 'Visible to friends for 24h'}
                selected={selection.storyDestinations.includes(opt.id)}
                onToggle={() => onSelectionChange(toggleStoryDestination(selection, opt.id))}
              />
            ))}
          </>
        )}

        {visibleRecent.length > 0 && (
          <>
            <SectionHeader label="Recent" />
            {visibleRecent.map((r) => rowFor(r, closeFriendIds.has(r.id) ? 'BF' : null))}
          </>
        )}

        {visibleBest.length > 0 && (
          <>
            <SectionHeader label="Best Friends" />
            {visibleBest.map((r) => rowFor(r, 'BF'))}
          </>
        )}

        <SectionHeader label="Friends" />
        {visibleFriends.length ? (
          visibleFriends.map((r) => rowFor(r, closeFriendIds.has(r.id) ? 'BF' : null))
        ) : (
          <p className="px-3 py-2 text-sm text-muted-foreground">
            {q ? 'No friends match your search' : 'Add friends to send snaps'}
          </p>
        )}

        {visibleGroups.length > 0 && (
          <>
            <SectionHeader label="Groups" />
            {visibleGroups.map((r) => rowFor(r))}
          </>
        )}
      </div>

      {/* Bottom bar: chips + send */}
      <div
        className="absolute bottom-0 left-0 right-0 border-t border-border/40 bg-background/95 px-3 pt-2 backdrop-blur-xl"
        style={{ paddingBottom: 'calc(var(--sab, 0px) + 0.75rem)' }}
      >
        {chips.length > 0 && (
          <div className="scrollbar-hide mb-2 flex gap-1.5 overflow-x-auto pb-0.5">
            {chips.map((chip) => (
              <motion.span
                key={chip.key}
                layout
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex shrink-0 items-center gap-1 rounded-full bg-primary/15 py-1 pl-3 pr-1 text-xs font-semibold text-primary"
              >
                {chip.label}
                <button
                  type="button"
                  aria-label={`Remove ${chip.label}`}
                  onClick={chip.remove}
                  className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-primary/20"
                >
                  <X className="h-3 w-3" />
                </button>
              </motion.span>
            ))}
          </div>
        )}
        <button
          type="button"
          disabled={!hasAnyDestination(selection)}
          onClick={() => {
            triggerHaptic('medium');
            onConfirm();
          }}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-bold transition-all',
            hasAnyDestination(selection)
              ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30'
              : 'bg-muted text-muted-foreground',
          )}
        >
          <Send className="h-4 w-4" />
          {count > 0 ? `Send to ${count}` : 'Select recipients'}
        </button>
      </div>
    </div>
  );
}
