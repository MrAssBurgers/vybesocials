import { useState } from 'react';
import { motion } from 'framer-motion';
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

interface PlacePageSheetProps {
  place: MapPlace;
  onClose: () => void;
  onNavigate: () => void;
  onCheckIn?: () => void;
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

function PostComments({ postId, placeId }: { postId: string; placeId: string }) {
  const { data: comments = [] } = usePlacePostComments(postId);
  const createComment = useCreatePlacePostComment();
  const [draft, setDraft] = useState('');

  const submit = async () => {
    const text = draft.trim();
    if (!text) return;
    const local = containsBlockedContent(text);
    if (local.blocked) {
      toast.error('Comment contains blocked content');
      return;
    }
    const vybe = await runPublishVybeCheck({ caption: text, contentType: 'text' });
    if (vybe.blocked || !vybe.allowed) {
      toast.error(vybe.message || 'Vybe Check did not pass');
      return;
    }
    try {
      await createComment.mutateAsync({ postId, content: text, placeId });
      setDraft('');
    } catch {
      toast.error('Could not post comment');
    }
  };

  return (
    <div className="mt-2 pl-2 border-l border-white/10 space-y-2">
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
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
          placeholder="Reply…"
          maxLength={200}
          className="flex-1 h-8 rounded-lg bg-white/6 border border-white/8 px-2 text-[11px] text-white placeholder:text-white/30 outline-none"
        />
        <button
          type="button"
          disabled={!draft.trim() || createComment.isPending}
          onClick={() => void submit()}
          className="h-8 w-8 rounded-lg bg-white/10 flex items-center justify-center text-white disabled:opacity-40"
        >
          <Send className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

export function PlacePageSheet({ place, onClose, onNavigate, onCheckIn }: PlacePageSheetProps) {
  const vibe = computePlaceVibe(place);
  const { data: posts = [] } = usePlacePosts(place.id);
  const createPost = useCreatePlacePost();
  const { data: intel, isLoading: intelLoading, isFailed: intelFailed, refreshIntel } = useLocationIntel({
    latitude: place.latitude,
    longitude: place.longitude,
    placeName: place.name,
    placeId: place.id,
  });
  const [draft, setDraft] = useState('');
  const [expandedPost, setExpandedPost] = useState<string | null>(null);

  const submitPost = async () => {
    const text = draft.trim();
    if (!text) return;
    const local = containsBlockedContent(text);
    if (local.blocked) {
      toast.error('Post contains blocked content');
      return;
    }
    const vybe = await runPublishVybeCheck({ caption: text, contentType: 'text' });
    if (vybe.blocked || !vybe.allowed) {
      toast.error(vybe.message || 'Vybe Check did not pass');
      return;
    }
    try {
      await createPost.mutateAsync({ placeId: place.id, content: text });
      setDraft('');
      toast.success('Posted to this spot');
    } catch {
      toast.error('Could not post');
    }
  };

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[2000] bg-black/40" onClick={onClose} />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="fixed inset-x-0 bottom-0 z-[2001] max-h-[88vh] overflow-y-auto rounded-t-3xl bg-black/95 border-t border-white/10"
      >
        {place.photo_url ? (
          <div className="relative h-44">
            <img src={place.photo_url} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
          </div>
        ) : (
          <div className="h-24 bg-gradient-to-br from-orange-500/30 to-pink-500/20" />
        )}

        <div className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <span className={cn(
            'inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full mb-2',
            vibe.level === 'busy' && 'bg-red-500/20 text-red-300',
            vibe.level === 'active' && 'bg-yellow-500/20 text-yellow-200',
            vibe.level === 'chill' && 'bg-green-500/20 text-green-200',
            vibe.level === 'quiet' && 'bg-blue-500/20 text-blue-200',
          )}>
            {vibe.emoji} {vibe.label} · Vibe {vibe.score}
          </span>
          <h2 className="text-2xl font-bold text-white">{place.name}</h2>
          <p className="text-sm text-white/45 capitalize">{place.category}</p>

          {place.description && (
            <p className="text-sm text-white/70 mt-3 leading-relaxed">{place.description}</p>
          )}

          <LocationIntelPanel
            intel={intel}
            loading={intelLoading}
            failed={intelFailed}
            onRefresh={() => void refreshIntel()}
            className="mt-4"
          />

          <div className="grid grid-cols-2 gap-2 mt-4">
            <StatCard icon={Users} label="Crowd" value={vibe.crowdEstimate} />
            <StatCard icon={Flame} label="Check-ins" value={String(place.check_in_count)} />
          </div>

          <div className="mt-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/40 mb-2">Place feed</p>
            <div className="flex gap-2 mb-3">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void submitPost()}
                placeholder="Share a tip, vibe, or question…"
                maxLength={280}
                className="flex-1 h-10 rounded-xl bg-white/8 border border-white/10 px-3 text-sm text-white placeholder:text-white/35 outline-none"
              />
              <button
                type="button"
                disabled={!draft.trim() || createPost.isPending}
                onClick={() => void submitPost()}
                className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {posts.length === 0 ? (
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
                      <PostComments postId={p.id} placeId={place.id} />
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <button type="button" onClick={onNavigate}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-primary font-bold text-primary-foreground">
              <Navigation className="h-4 w-4" /> Live route
            </button>
            {onCheckIn && (
              <button type="button" onClick={onCheckIn}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white/10 text-white font-semibold">
                <MapPin className="h-4 w-4" /> Check in
              </button>
            )}
          </div>

          <button type="button" onClick={onClose} className="mt-4 w-full py-2 text-xs text-white/35">Close</button>
        </div>
      </motion.div>
    </>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <div className="p-3 rounded-xl bg-white/5 border border-white/8">
      <div className="flex items-center gap-1.5 text-white/40 text-[10px] font-bold uppercase mb-1">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <p className="text-sm font-semibold text-white">{value}</p>
    </div>
  );
}
