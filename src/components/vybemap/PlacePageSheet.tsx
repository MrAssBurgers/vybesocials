import { useRef, useState } from 'react';
import { MapPin, Users, Navigation, Flame, Send, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { MapPlace } from '@/lib/vybemap/types';
import { computePlaceVibe } from '@/lib/vybemap/placeVibe';
import { usePlacePosts, useCreatePlacePost, usePlacePostComments, useCreatePlacePostComment } from '@/hooks/vybemap/useVybeMap';
import { useLocationIntel } from '@/hooks/vybemap/useLocationIntel';
import { LocationIntelPanel } from '@/components/vybemap/LocationIntelPanel';
import { containsBlockedContent } from '@/lib/contentModeration';
import { runPublishVybeCheck } from '@/lib/vybeCheck';
import { cn } from '@/lib/utils';
import { useMapSocialItem, useMapSocialMutation, useMapViewGuard } from '@/hooks/vybemap/useMapSocial';
import { MapReadNotice } from './MapReadNotice';
import { MapLegacyReview } from './MapLegacyReview';
import { MapLiquidSheet } from '@/components/vybemap/MapLiquidSheet';
import type { MapSocialRouteLease } from '@/lib/vybemap/mapSocialRouteLease';

interface PlacePageSheetProps {
  place: MapPlace;
  onClose: () => void;
  onNavigate: (place: MapPlace, lease: MapSocialRouteLease) => void;
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

function PostComments({ postId, placeId, draft, setDraft }: { postId: string; placeId: string; draft: string; setDraft: (value: string) => void }) {
  const commentsQuery = usePlacePostComments(postId);
  const comments = commentsQuery.data || [];
  const view = useMapViewGuard(postId);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const createComment = useCreatePlacePostComment();

  const submit = async () => {
    const text = draft.trim(); if (!text || pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try {
      view.guard();
      if (containsBlockedContent(text).blocked) throw new Error('Comment contains blocked content.');
      const vybe = await runPublishVybeCheck({ caption: text, contentType: 'text' }); view.guard();
      if (vybe.blocked || !vybe.allowed) throw new Error(vybe.message || 'Vybe Check did not pass.');
      await createComment.mutateAsync({ postId, content: text, placeId }); view.guard(); setDraft('');
    } catch (error) { try { view.guard(); setError(error instanceof Error ? error.message : 'Could not confirm this reply. Please retry.'); } catch { /* Closed view. */ } }
    finally { pending.current = false; try { view.guard(); setBusy(false); } catch { /* Closed view. */ } }
  };

  return (
    <div className="mt-2 pl-2 border-l border-white/10 space-y-2">
      <MapReadNotice nextGroup={commentsQuery.nextGroup} windowed={commentsQuery.windowed} onRestart={() => void commentsQuery.restart()} label="Replies" loading={commentsQuery.isLoading} failed={commentsQuery.isError} onRetry={() => void commentsQuery.refetch()} more={commentsQuery.hasNextPage} loadingMore={commentsQuery.isFetchingNextPage} onMore={() => void commentsQuery.fetchNextPage()} />
      {error && <p role="alert" className="text-xs">{error}</p>}
      {comments.map((c) => (
        <div key={c.id} className="text-[11px] text-white/65">
          <span className="font-semibold text-white/80">
            {c.profile?.display_name || c.profile?.username || 'User'}
          </span>
          {' '}{c.content}
        </div>
      ))}
      <div className="flex gap-1.5">
        <input
          disabled={busy}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
          placeholder="Reply…"
          maxLength={200}
          className="flex-1 h-8 rounded-lg bg-white/6 border border-white/8 px-2 text-[11px] text-white placeholder:text-white/30 outline-none"
        />
        <button
          type="button"
          aria-label="Send reply"
          disabled={!draft.trim() || busy || commentsQuery.isLoading || commentsQuery.isError}
          onClick={() => void submit()}
          className="h-8 w-8 rounded-lg bg-white/10 flex items-center justify-center text-white disabled:opacity-40"
        >
          <Send className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

export function PlacePageSheet({ place: initial, onClose, onNavigate }: PlacePageSheetProps) {
  const query = useMapSocialItem('place', initial.id);
  const view = useMapViewGuard(initial.id);
  const checkIn = useMapSocialMutation(initial.id);
  const last = useRef(initial); if (query.data) last.current = query.data;
  const place = query.data || last.current;
  const admitted = useRef(!!query.data); admitted.current = !!query.data;
  const guard = () => { view.guard(); if (!admitted.current) throw new Error('Refresh this spot before continuing.'); };
  const pending = useRef(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const vibe = computePlaceVibe(place);
  const postsQuery = usePlacePosts(query.data && !place.legacy ? place.id : undefined);
  const posts = postsQuery.data || [];
  const createPost = useCreatePlacePost();
  const { data: intel, isLoading: intelLoading, isFailed: intelFailed, refreshIntel } = useLocationIntel({
    latitude: place.latitude,
    longitude: place.longitude,
    placeName: place.name,
    placeId: place.id,
    enabled: !!query.data,
  });
  const [draft, setDraft] = useState('');
  const [expandedPost, setExpandedPost] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  const submitPost = async () => {
    const text = draft.trim(); if (!text || pending.current || place.legacy) return;
    pending.current = true; setBusy(true); setError('');
    try {
      guard();
      if (containsBlockedContent(text).blocked) throw new Error('Post contains blocked content.');
      const vybe = await runPublishVybeCheck({ caption: text, contentType: 'text' }); guard();
      if (vybe.blocked || !vybe.allowed) throw new Error(vybe.message || 'Vybe Check did not pass.');
      await createPost.mutateAsync({ placeId: place.id, content: text }); view.guard(); setDraft(''); toast.success('Posted to this spot');
    } catch (error) { try { view.guard(); setError(error instanceof Error ? error.message : 'Could not confirm this post. Please retry.'); } catch { /* Closed view. */ } }
    finally { pending.current = false; try { view.guard(); setBusy(false); } catch { /* Closed view. */ } }
  };
  const handleCheckIn = async () => {
    try {
      guard(); if (checkIn.isPending || place.legacy) return; setError('');
      await checkIn.mutateAsync({ action: 'checkIn', placeId: place.id, message: `At ${place.name}` });
      view.guard(); toast.success('Checked in with friends');
    } catch { try { view.guard(); setError('Check-in could not be confirmed. Please retry.'); } catch { /* Closed view. */ } }
  };

  return (
    <MapLiquidSheet onClose={onClose} maxHeight="88vh" showHandle contentClassName="px-0 pb-0">
      <div className="px-5"><MapReadNotice label="Spot" loading={query.isLoading} failed={query.isError} onRetry={() => void query.refetch()} />{query.data === null && <p role="status">This spot is no longer available.</p>}<button type="button" onClick={onClose} className="py-2 text-xs">Close</button></div>
      {query.data && <>
      {place.photo_url ? (
        <div className="relative h-44">
          <img src={place.photo_url} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
        </div>
      ) : (
        <div className="h-24 bg-gradient-to-br from-orange-500/30 to-pink-500/20" />
      )}

      <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <span className={cn(
            'inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full mb-2',
            vibe.level === 'busy' && 'bg-red-500/20 text-red-300',
            vibe.level === 'active' && 'bg-yellow-500/20 text-yellow-200',
            vibe.level === 'chill' && 'bg-green-500/20 text-green-200',
            vibe.level === 'quiet' && 'bg-blue-500/20 text-blue-200',
          )}>
            {vibe.emoji} {vibe.label} · Vibe {vibe.score}
          </span>
          <h2 className="text-2xl font-bold text-foreground">{place.name}</h2>
          <p className="text-sm text-muted-foreground capitalize">{place.category}</p>

          {place.description && (
            <p className="text-sm text-foreground/80 mt-3 leading-relaxed">{place.description}</p>
          )}

          <LocationIntelPanel
            intel={intel}
            loading={intelLoading}
            failed={intelFailed}
            onRefresh={() => void refreshIntel()}
            className="mt-4"
          />

          <div className="grid grid-cols-2 gap-2 mt-4">
            <StatCard icon={Users} label="Activity" value={vibe.activitySummary} />
            <StatCard icon={Flame} label="Check-ins" value={String(place.check_in_count)} />
          </div>

          {place.legacy && place.revision && <MapLegacyReview kind="place" id={place.id} revision={place.revision} />}
          {error && <p role="alert" className="text-sm mt-3">{error}</p>}
          <div className="mt-4" hidden={!!place.legacy}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Place feed</p>
            <div className="flex gap-2 mb-3">
              <input
                disabled={busy}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void submitPost()}
                placeholder="Share a tip, vibe, or question…"
                maxLength={280}
                className="flex-1 h-10 rounded-xl bg-card/50 border border-border/50 px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
              <button
                type="button"
                aria-label="Post to spot"
                disabled={!draft.trim() || busy || postsQuery.isError || postsQuery.isLoading}
                onClick={() => void submitPost()}
                className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <MapReadNotice nextGroup={postsQuery.nextGroup} windowed={postsQuery.windowed} onRestart={() => void postsQuery.restart()} label="Posts" loading={postsQuery.isLoading} failed={postsQuery.isError} onRetry={() => void postsQuery.refetch()} more={postsQuery.hasNextPage} loadingMore={postsQuery.isFetchingNextPage} onMore={() => void postsQuery.fetchNextPage()} />
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {posts.length === 0 && !postsQuery.isLoading && !postsQuery.isError ? (
                <p className="text-xs text-white/40 py-2">No posts yet — be first!</p>
              ) : (
                posts.map((p) => (
                  <div key={p.id} className="p-2.5 rounded-xl bg-white/5 border border-white/8">
                    <div className="flex gap-2">
                      <div className="h-8 w-8 rounded-full overflow-hidden bg-white/10 shrink-0">
                        {p.profile?.avatar_url ? (
                          <img src={p.profile.avatar_url} alt="" className="h-full w-full object-cover" />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-bold text-white/80">
                          {p.profile?.display_name || p.profile?.username || 'User'}
                          <span className="text-white/35 font-normal ml-1">{timeAgo(p.created_at)}</span>
                        </p>
                        <p className="text-xs text-white/65 mt-0.5">{p.content}</p>
                        <button
                          type="button"
                          onClick={() => setExpandedPost(expandedPost === p.id ? null : p.id)}
                          className="mt-1 flex items-center gap-1 text-[10px] text-white/40 hover:text-white/70"
                        >
                          <MessageCircle className="h-3 w-3" />
                          {(p.comment_count ?? 0) > 0 ? `${p.comment_count} replies` : 'Reply'}
                        </button>
                      </div>
                    </div>
                    {expandedPost === p.id && (
                      <PostComments postId={p.id} placeId={place.id} draft={replyDrafts[p.id] || ''} setDraft={value => setReplyDrafts(previous => ({ ...previous, [p.id]: value }))} />
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <button type="button" onClick={() => { try { guard(); if (query.data) onNavigate(query.data, query.captureRouteLease()); } catch { setError('Refresh this spot before starting directions.'); } }}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-primary font-bold text-primary-foreground">
              <Navigation className="h-4 w-4" /> Live route
            </button>
            {!place.legacy && (
              <button type="button" disabled={checkIn.isPending} onClick={() => void handleCheckIn()}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white/10 text-white font-semibold">
                <MapPin className="h-4 w-4" /> {checkIn.isPending ? 'Checking in…' : 'Check in with friends'}
              </button>
            )}
          </div>

          <button type="button" onClick={onClose} className="mt-4 w-full py-2 text-xs text-muted-foreground">Close</button>
        </div>
      </>}
    </MapLiquidSheet>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <div className="p-3 rounded-xl liquid-glass-subtle border border-border/40">
      <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] font-bold uppercase mb-1">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <p className="text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}
