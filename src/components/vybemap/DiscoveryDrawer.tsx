import { motion } from 'framer-motion';
import { ChevronUp, Flame, MapPin, Users, Video, Calendar, Radio } from 'lucide-react';
import type { LiveFriend, MapStoryPin, MapClipPin, MapMeetup, MapPlace, FriendCheckIn } from '@/lib/vybemap/types';
import { cn } from '@/lib/utils';

interface DiscoveryDrawerProps {
  open: boolean;
  onToggle: () => void;
  friends: LiveFriend[];
  stories: MapStoryPin[];
  clips: MapClipPin[];
  meetups: MapMeetup[];
  places: MapPlace[];
  radarLabel: string;
  friendCheckIns?: FriendCheckIn[];
  onFriendTap: (f: LiveFriend) => void;
  onMeetupTap: (m: MapMeetup) => void;
  onPlaceTap: (p: MapPlace) => void;
  onCreateMeetup?: () => void;
}

export function DiscoveryDrawer({
  open, onToggle, friends, stories, clips, meetups, places, radarLabel, friendCheckIns = [],
  onFriendTap, onMeetupTap, onPlaceTap, onCreateMeetup,
}: DiscoveryDrawerProps) {
  return (
    <motion.div
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-[1500]"
      animate={{ y: open ? 0 : 'calc(100% - 3.5rem)' }}
      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex flex-col items-center pt-2 pb-1 rounded-t-3xl bg-black/85 backdrop-blur-2xl border-t border-white/10"
      >
        <div className="w-10 h-1 rounded-full bg-white/25 mb-2" />
        <div className="flex items-center gap-2 text-white/80 text-sm font-semibold px-4 pb-2">
          <ChevronUp className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
          Discover
          {radarLabel && <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/30 text-primary">{radarLabel}</span>}
        </div>
      </button>

      <div className="max-h-[55vh] overflow-y-auto bg-black/90 backdrop-blur-2xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-5">
        {friendCheckIns.length > 0 && (
          <Section icon={MapPin} title="Friend Activity" count={friendCheckIns.length}>
            {friendCheckIns.slice(0, 8).map((c) => {
              const name = c.profile?.display_name || c.profile?.username || 'Friend';
              return (
                <button key={c.id} type="button" onClick={() => onPlaceTap({
                  id: c.place_id || c.id,
                  name: c.place_name || 'Check-in',
                  category: 'hangout',
                  latitude: c.latitude,
                  longitude: c.longitude,
                  check_in_count: 1,
                  story_count: 0,
                })} className="w-full text-left py-2 text-sm text-white/80">
                  <span className="font-semibold">{name}</span>
                  {c.place_name ? ` at ${c.place_name}` : c.message ? ` — ${c.message}` : ' is nearby'}
                </button>
              );
            })}
          </Section>
        )}

        <Section icon={Users} title="Nearby Friends" count={friends.length}>
          <div className="flex gap-3 overflow-x-auto scrollbar-hide py-1">
            {friends.slice(0, 12).map((f) => (
              <button key={f.user_id} type="button" onClick={() => onFriendTap(f)} className="shrink-0 flex flex-col items-center gap-1">
                <div className="h-14 w-14 rounded-full overflow-hidden ring-2 ring-primary/40">
                  {f.profile?.avatar_url ? (
                    <img src={f.profile.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full bg-violet-600 flex items-center justify-center text-white font-bold">
                      {(f.profile?.username || '?')[0]}
                    </div>
                  )}
                </div>
                <span className="text-[10px] text-white/60 max-w-[56px] truncate">{f.profile?.username}</span>
              </button>
            ))}
          </div>
        </Section>

        <Section icon={Radio} title="Live Stories" count={stories.length}>
          <HorizScroll>
            {stories.map((s) => (
              <div key={s.id} className="shrink-0 w-20 h-28 rounded-xl overflow-hidden bg-gradient-to-br from-pink-500 to-violet-600 ring-2 ring-white/20">
                {s.thumbnail_url || s.media_url ? (
                  <img src={s.thumbnail_url || s.media_url} alt="" className="w-full h-full object-cover" />
                ) : null}
              </div>
            ))}
          </HorizScroll>
        </Section>

        <Section icon={Video} title="Local Clips" count={clips.length}>
          <HorizScroll>
            {clips.map((c) => (
              <div key={c.id} className="shrink-0 w-24 h-32 rounded-xl overflow-hidden bg-black ring-1 ring-white/10">
                {c.thumbnail_url && <img src={c.thumbnail_url} alt="" className="w-full h-full object-cover" />}
              </div>
            ))}
          </HorizScroll>
        </Section>

        <Section icon={Calendar} title="Meetups" count={meetups.length}>
          {onCreateMeetup && (
            <button type="button" onClick={onCreateMeetup}
              className="w-full mb-2 py-2 rounded-xl border border-dashed border-emerald-500/40 text-xs font-semibold text-emerald-300">
              + Plan a meetup here
            </button>
          )}
          {meetups.map((m) => (
            <button key={m.id} type="button" onClick={() => onMeetupTap(m)} className="w-full text-left p-3 rounded-xl bg-white/5 mb-2">
              <p className="text-sm font-semibold text-white">{m.title}</p>
              <p className="text-[10px] text-white/40">{m.dest_label || 'Meetup'} · {m.member_count ?? m.members?.length ?? 1} going</p>
            </button>
          ))}
        </Section>

        <Section icon={Flame} title="Trending Places" count={places.length}>
          {places.slice(0, 6).map((p) => (
            <button key={p.id} type="button" onClick={() => onPlaceTap(p)} className="w-full flex items-center gap-3 py-2 text-left">
              <MapPin className="h-4 w-4 text-orange-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm text-white truncate">{p.name}</p>
                <p className="text-[10px] text-white/40 line-clamp-1">
                  {p.description || `${p.check_in_count} vibes · ${p.category}`}
                </p>
              </div>
            </button>
          ))}
        </Section>
      </div>
    </motion.div>
  );
}

function Section({ icon: Icon, title, count, children }: { icon: typeof Users; title: string; count: number; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 text-white/50" />
        <h4 className="text-xs font-bold text-white/70 uppercase tracking-wider">{title}</h4>
        <span className="text-[10px] text-white/30">{count}</span>
      </div>
      {children}
    </div>
  );
}

function HorizScroll({ children }: { children: React.ReactNode }) {
  return <div className="flex gap-2 overflow-x-auto scrollbar-hide py-1">{children}</div>;
}
