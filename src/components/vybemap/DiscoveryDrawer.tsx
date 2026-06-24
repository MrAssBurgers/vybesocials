import { motion } from 'framer-motion';
import { ChevronUp, Flame, MapPin, Users, Video, Calendar } from 'lucide-react';
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
  const peekHeight = '5.5rem';

  return (
    <motion.div
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-[1500]"
      animate={{ y: open ? 0 : `calc(100% - ${peekHeight})` }}
      transition={{ type: 'spring', damping: 34, stiffness: 340 }}
    >
      <div className="vybe-map-sheet !rounded-t-[1.75rem] !shadow-[0_-16px_48px_rgba(0,0,0,0.1)]">
        <button
          type="button"
          onClick={onToggle}
          className="w-full flex flex-col items-center pt-3 pb-1"
        >
          <div className="w-10 h-1 rounded-full bg-black/10 mb-2" />
          <div className="flex items-center gap-2 text-[#111] text-[15px] font-bold tracking-tight px-4 pb-1">
            <ChevronUp className={cn('h-4 w-4 text-black/40 transition-transform', open && 'rotate-180')} />
            {friends.length ? `${friends.length} friends nearby` : 'Friends on map'}
            {radarLabel && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 font-bold">
                {radarLabel}
              </span>
            )}
          </div>
        </button>

        {/* Snap-style friend rail — always visible in peek */}
        <div className="px-3 pb-3">
          <div className="flex gap-3 overflow-x-auto scrollbar-hide py-1">
            {friends.length === 0 ? (
              <p className="text-xs text-black/45 px-2 py-3">Friends who share location will appear here.</p>
            ) : (
              friends.slice(0, 16).map((f) => {
                const live = Date.now() - new Date(f.updated_at).getTime() < 120_000;
                const name = f.profile?.display_name || f.profile?.username || '?';
                return (
                  <button
                    key={f.user_id}
                    type="button"
                    onClick={() => onFriendTap(f)}
                    className="shrink-0 flex flex-col items-center gap-1.5 w-[4.25rem]"
                  >
                    <div
                      className={cn(
                        'rounded-full p-[3px]',
                        live ? 'bg-gradient-to-br from-yellow-400 via-pink-500 to-violet-500' : 'bg-black/15',
                      )}
                    >
                      <div className="h-14 w-14 rounded-full overflow-hidden bg-[#f4f4f5] ring-2 ring-white">
                        {f.profile?.avatar_url ? (
                          <img src={f.profile.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-lg font-bold text-black/50">
                            {name[0]}
                          </div>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] font-medium text-black/55 max-w-full truncate">
                      {f.profile?.username || name.split(' ')[0]}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {open && (
          <div className="max-h-[48vh] overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-5 border-t border-black/5 pt-4">
            {friendCheckIns.length > 0 && (
              <Section icon={MapPin} title="Recent activity" count={friendCheckIns.length}>
                {friendCheckIns.slice(0, 6).map((c) => {
                  const name = c.profile?.display_name || c.profile?.username || 'Friend';
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => onPlaceTap({
                        id: c.place_id || c.id,
                        name: c.place_name || 'Check-in',
                        category: 'hangout',
                        latitude: c.latitude,
                        longitude: c.longitude,
                        check_in_count: 1,
                        story_count: 0,
                      })}
                      className="w-full text-left py-2 text-sm text-black/75"
                    >
                      <span className="font-semibold text-black">{name}</span>
                      {c.place_name ? ` · ${c.place_name}` : c.message ? ` — ${c.message}` : ' nearby'}
                    </button>
                  );
                })}
              </Section>
            )}

            {stories.length > 0 && (
              <Section icon={Users} title="Stories nearby" count={stories.length}>
                <HorizScroll>
                  {stories.map((s) => (
                    <div key={s.id} className="shrink-0 w-16 h-24 rounded-2xl overflow-hidden bg-gradient-to-br from-pink-400 to-violet-500 ring-2 ring-white shadow-sm">
                      {(s.thumbnail_url || s.media_url) && (
                        <img src={s.thumbnail_url || s.media_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                      )}
                    </div>
                  ))}
                </HorizScroll>
              </Section>
            )}

            {clips.length > 0 && (
              <Section icon={Video} title="Clips nearby" count={clips.length}>
                <HorizScroll>
                  {clips.map((c) => (
                    <div key={c.id} className="shrink-0 w-20 h-28 rounded-2xl overflow-hidden bg-black/5 ring-1 ring-black/8">
                      {c.thumbnail_url && <img src={c.thumbnail_url} alt="" className="w-full h-full object-cover" loading="lazy" />}
                    </div>
                  ))}
                </HorizScroll>
              </Section>
            )}

            {(meetups.length > 0 || onCreateMeetup) && (
              <Section icon={Calendar} title="Meetups" count={meetups.length}>
                {onCreateMeetup && (
                  <button
                    type="button"
                    onClick={onCreateMeetup}
                    className="w-full mb-2 py-2.5 rounded-2xl border border-dashed border-emerald-500/35 text-xs font-semibold text-emerald-700 bg-emerald-500/5"
                  >
                    + Plan a meetup
                  </button>
                )}
                {meetups.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onMeetupTap(m)}
                    className="w-full text-left p-3 rounded-2xl bg-black/[0.03] mb-2"
                  >
                    <p className="text-sm font-semibold text-black">{m.title}</p>
                    <p className="text-[10px] text-black/45">
                      {m.dest_label || 'Meetup'} · {m.member_count ?? m.members?.length ?? 1} going
                    </p>
                  </button>
                ))}
              </Section>
            )}

            {places.length > 0 && (
              <Section icon={Flame} title="Hot spots" count={places.length}>
                {places.slice(0, 6).map((p) => (
                  <button key={p.id} type="button" onClick={() => onPlaceTap(p)} className="w-full flex items-center gap-3 py-2 text-left">
                    <MapPin className="h-4 w-4 text-amber-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm text-black truncate font-medium">{p.name}</p>
                      <p className="text-[10px] text-black/40 line-clamp-1">
                        {p.description || `${p.check_in_count} check-ins`}
                      </p>
                    </div>
                  </button>
                ))}
              </Section>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function Section({ icon: Icon, title, count, children }: { icon: typeof Users; title: string; count: number; children: React.ReactNode }) {
  if (count === 0 && title !== 'Meetups') return null;
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 text-black/35" />
        <h4 className="text-[11px] font-bold text-black/50 uppercase tracking-wider">{title}</h4>
        {count > 0 && <span className="text-[10px] text-black/30">{count}</span>}
      </div>
      {children}
    </div>
  );
}

function HorizScroll({ children }: { children: React.ReactNode }) {
  return <div className="flex gap-2 overflow-x-auto scrollbar-hide py-1">{children}</div>;
}
