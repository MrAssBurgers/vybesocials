import { memo } from 'react';
import { motion } from 'framer-motion';
import {
  Brain, Ruler, Cake, UtensilsCrossed, Music, Tv,
  Headphones, Play,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUserAbout } from '@/hooks/useUserAbout';

interface ProfileAboutDetailsProps {
  profileId: string;
  birthday?: string | null;
}

const MBTI_COLORS: Record<string, string> = {
  INTJ: 'from-purple-500/20 to-indigo-500/20 text-purple-300',
  INTP: 'from-blue-500/20 to-cyan-500/20 text-blue-300',
  ENTJ: 'from-rose-500/20 to-pink-500/20 text-rose-300',
  ENTP: 'from-orange-500/20 to-amber-500/20 text-orange-300',
  INFJ: 'from-teal-500/20 to-emerald-500/20 text-teal-300',
  INFP: 'from-violet-500/20 to-purple-500/20 text-violet-300',
  ENFJ: 'from-green-500/20 to-teal-500/20 text-green-300',
  ENFP: 'from-yellow-500/20 to-orange-500/20 text-yellow-300',
  ISTJ: 'from-slate-500/20 to-gray-500/20 text-slate-300',
  ISFJ: 'from-sky-500/20 to-blue-500/20 text-sky-300',
  ESTJ: 'from-red-500/20 to-rose-500/20 text-red-300',
  ESFJ: 'from-pink-500/20 to-fuchsia-500/20 text-pink-300',
  ISTP: 'from-zinc-500/20 to-neutral-500/20 text-zinc-300',
  ISFP: 'from-lime-500/20 to-green-500/20 text-lime-300',
  ESTP: 'from-amber-500/20 to-yellow-500/20 text-amber-300',
  ESFP: 'from-fuchsia-500/20 to-pink-500/20 text-fuchsia-300',
};

function calculateAge(birthday: string): number {
  const today = new Date();
  const birth = new Date(birthday);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

const stagger = {
  container: { transition: { staggerChildren: 0.06 } },
  item: {
    initial: { opacity: 0, y: 12, scale: 0.95 },
    animate: { opacity: 1, y: 0, scale: 1 },
    transition: { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

export const ProfileAboutDetails = memo(function ProfileAboutDetails({
  profileId,
  birthday,
}: ProfileAboutDetailsProps) {
  const { data: about } = useUserAbout(profileId);

  if (!about) return null;

  const hasStats = about.mbti || about.height || about.favorite_food || (about.show_age && birthday);
  const hasGenres = about.music_genres && about.music_genres.length > 0;
  const hasListening = about.now_listening_title;
  const hasWatching = about.now_watching_title;

  if (!hasStats && !hasGenres && !hasListening && !hasWatching) return null;

  const age = about.show_age && birthday ? calculateAge(birthday) : null;

  return (
    <motion.div
      initial="initial"
      animate="animate"
      variants={stagger.container}
      className="space-y-3"
    >
      {/* Stats Grid */}
      {hasStats && (
        <div className="grid grid-cols-2 gap-2">
          {age !== null && (
            <StatPill icon={Cake} label="Age" value={String(age)} />
          )}
          {about.mbti && (
            <StatPill
              icon={Brain}
              label="MBTI"
              value={about.mbti}
              className={cn(
                'bg-gradient-to-br',
                MBTI_COLORS[about.mbti] || 'from-primary/20 to-accent/20 text-primary'
              )}
            />
          )}
          {about.height && (
            <StatPill icon={Ruler} label="Height" value={about.height} />
          )}
          {about.favorite_food && (
            <StatPill icon={UtensilsCrossed} label="Fav Food" value={about.favorite_food} />
          )}
        </div>
      )}

      {/* Music Genres */}
      {hasGenres && (
        <motion.div variants={stagger.item} className="flex flex-wrap gap-1.5">
          <Music className="w-3.5 h-3.5 text-muted-foreground mt-0.5" />
          {about.music_genres.map((genre) => (
            <span
              key={genre}
              className="px-2.5 py-0.5 text-xs rounded-full bg-primary/10 text-primary border border-primary/20 font-medium"
            >
              {genre}
            </span>
          ))}
        </motion.div>
      )}

      {/* Now Listening */}
      {hasListening && (
        <motion.div
          variants={stagger.item}
          className="liquid-glass-card p-3 rounded-xl flex items-center gap-3"
        >
          {about.now_listening_cover_url ? (
            <img
              src={about.now_listening_cover_url}
              alt="Album art"
              className="w-11 h-11 rounded-lg object-cover shadow-md"
            />
          ) : (
            <div className="w-11 h-11 rounded-lg bg-primary/20 flex items-center justify-center">
              <Headphones className="w-5 h-5 text-primary" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
              <span className="inline-flex gap-[2px]">
                {[1, 2, 3].map((i) => (
                  <span
                    key={i}
                    className="w-[3px] rounded-full bg-green-400 inline-block"
                    style={{
                      height: `${6 + Math.random() * 6}px`,
                      animation: `eq-bar 0.${4 + i}s ease-in-out infinite alternate`,
                    }}
                  />
                ))}
              </span>
              Now Listening
              {about.now_listening_service && (
                <span className="text-foreground/50 capitalize">
                  · {about.now_listening_service.replace('_', ' ')}
                </span>
              )}
            </p>
            <p className="text-sm font-semibold truncate text-foreground">{about.now_listening_title}</p>
            {about.now_listening_artist && (
              <p className="text-xs text-muted-foreground truncate">{about.now_listening_artist}</p>
            )}
          </div>
        </motion.div>
      )}

      {/* Now Watching */}
      {hasWatching && (
        <motion.div
          variants={stagger.item}
          className="liquid-glass-card p-3 rounded-xl flex items-center gap-3"
        >
          {about.now_watching_cover_url ? (
            <img
              src={about.now_watching_cover_url}
              alt="Show poster"
              className="w-11 h-11 rounded-lg object-cover shadow-md"
            />
          ) : (
            <div className="w-11 h-11 rounded-lg bg-accent/20 flex items-center justify-center">
              <Play className="w-5 h-5 text-accent" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
              <Tv className="w-3 h-3" />
              Now Watching
              {about.now_watching_service && (
                <span className="text-foreground/50">· {about.now_watching_service}</span>
              )}
            </p>
            <p className="text-sm font-semibold truncate text-foreground">{about.now_watching_title}</p>
          </div>
        </motion.div>
      )}

      {/* Equalizer animation keyframes */}
      <style>{`
        @keyframes eq-bar {
          0% { height: 3px; }
          100% { height: 12px; }
        }
      `}</style>
    </motion.div>
  );
});
