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
  const peekHeight = '5.25rem';

  return (
    <motion.div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-[1500] overflow-hidden"
      animate={{ y: open ? 0 : `calc(100% - ${peekHeight})` }}
      transition={{ type: 'spring', damping: 36, stiffness: 380 }}
    >
      <div className="pointer-events-auto vybe-map-sheet">
        <button
          type="button"
          onClick={onToggle}
          className="w-full flex flex-col items-center pt-2.5 pb-0.5"
        >
          <div className="vybe-map-drawer-handle mb-2.5" />
          <div className="flex items-center gap-2 text-white text-sm font-semibold tracking-tight px-4 pb-1">
            <ChevronUp className={cn('h-4 w-4 text-white/40 transition-transform duration-200', open && 'rotate-180')} />
            {friends.length ? (
              <>
                <span>{friends.length} friend{friends.length === 1 ? '' : 's'} nearby</span>
                {radarLabel && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/25">
                    {radarLabel}
                  </span>
                )}
              </>
            ) : (
              <span className="text-white/70">Friends on map</span>
            )}
          </div>
        </button>

        <div className="px-3 pb-3">
          <div className="flex gap-2.5 overflow-x-auto scrollbar-hide py-1">
            {friends.length === 0 ? (
              <div className="vybe-map-empty-rail w-full">
                <div className="h-9 w-9 rounded-full bg-white/6 flex items-center justify-center shrink-0">
                  <Radio className="h-4 w-4 text-white/40" />
                </div>
                <div className="min-w-0 text-left">
                  <p className="text-xs font-semibold text-white/80">No friends live yet</p>
                  <p className="text-[10px] text-white/40 mt-0.5">Friends sharing location show up here</p>
                </div>
              </div>
            ) : (
              friends.slice(0, 16).map((f) => {
                const live = Date.now() - new Date(f.updated_at).getTime() < 120_000;
                const name = f.profile?.display_name || f.profile?.username || '?';
                return (
                  <button
                    key={f.user_id}
                    type="button"
                    onClick={() => onFriendTap(f)}
                    className="shrink-0 flex flex-col items-center gap-1.5 w-[4rem]"
                  >
                    <div
                      className={cn(
                        'rounded-full p-[2.5px]',
                        live
                          ? 'bg-gradient-to-br from-yellow-300 via-pink-500 to-violet-500'
                          : 'bg-white/15',
                      )}
                    >
                      <div className="h-[3.25rem] w-[3.25rem] rounded-full overflow-hidden bg-zinc-800 ring-2 ring-[#121820]">
                        {f.profile?.avatar_url ? (
                          <img src={f.profile.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-base font-bold text-white/50">
                            {name[0]}
                          </div>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] font-medium text-white/55 max-w-full truncate">
                      {f.profile?.username || name.split(' ')[0]}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {open && (
          <div className="max-h-[48vh] overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-5 border-t border-white/8 pt-4">
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
                      className="w-full text-left py-2.5 text-sm text-white/75 rounded-xl hover:bg-white/5 px-2 -mx-2 transition-colors"
                    >
                      <span className="font-semibold text-white">{name}</span>
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
                    <div key={s.id} className="shrink-0 w-16 h-24 rounded-2xl overflow-hidden bg-gradient-to-br from-pink-500 to-violet-600 ring-2 ring-white/10 shadow-lg">
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
                    <div key={c.id} className="shrink-0 w-20 h-28 rounded-2xl overflow-hidden bg-white/5 ring-1 ring-white/10">
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
                    className="w-full mb-2 py-2.5 rounded-2xl border border-dashed border-emerald-500/30 text-xs font-semibold text-emerald-300 bg-emerald-500/8 hover:bg-emerald-500/12 transition-colors"
                  >
                    + Plan a meetup
                  </button>
                )}
                {meetups.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onMeetupTap(m)}
                    className="w-full text-left p-3 rounded-2xl bg-white/5 border border-white/6 mb-2 hover:bg-white/8 transition-colors"
                  >
                    <p className="text-sm font-semibold text-white">{m.title}</p>
                    <p className="text-[10px] text-white/40 mt-0.5">
                      {m.dest_label || 'Meetup'} · {m.member_count ?? m.members?.length ?? 1} going
                    </p>
                  </button>
                ))}
              </Section>
            )}

            {places.length > 0 && (
              <Section icon={Flame} title="Hot spots" count={places.length}>
                {places.slice(0, 6).map((p) => (
                  <button key={p.id} type="button" onClick={() => onPlaceTap(p)} className="w-full flex items-center gap-3 py-2.5 text-left rounded-xl hover:bg-white/5 px-2 -mx-2 transition-colors">
                    <MapPin className="h-4 w-4 text-amber-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm text-white truncate font-medium">{p.name}</p>
                      <p className="text-[10px] text-white/40 line-clamp-1">
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
        <Icon className="h-4 w-4 text-white/35" />
        <h4 className="text-[10px] font-bold text-white/45 uppercase tracking-widest">{title}</h4>
        {count > 0 && <span className="text-[10px] text-white/25 tabular-nums">{count}</span>}
      </div>
      {children}
    </div>
  );
}

function HorizScroll({ children }: { children: React.ReactNode }) {
  return <div className="flex gap-2 overflow-x-auto scrollbar-hide py-1">{children}</div>;
}
