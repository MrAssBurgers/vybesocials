import { memo } from 'react';
import { usePageMeta } from '@/hooks/usePageMeta';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Dna, Sparkles, MapPin, MessageCircle, Radio, ShoppingBag, Wallet, Bot,
  Palette, Flame, Shuffle, Trophy, Camera, ShieldCheck, Heart, Users,
  Zap, Crown, Bell, PlayCircle, ArrowRight, Check, X, Home, Plus, User,
  Search, Send, Bookmark, Share2, MoreHorizontal, ArrowLeft, Lightbulb,
  Globe, Mic, Smile, Phone, GripVertical, Layers, Image as ImageIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePublicUserCount } from '@/hooks/usePublicUserCount';
import { useLandingTopCreators } from '@/hooks/useLandingTopCreators';

// On-brand avatars (replaces pravatar.cc)
import avatarMaya from '@/assets/avatars/maya.jpg';
import avatarJordan from '@/assets/avatars/jordan.jpg';
import avatarLeo from '@/assets/avatars/leo.jpg';
import avatarSky from '@/assets/avatars/sky.jpg';
import avatarMia from '@/assets/avatars/mia.jpg';
import avatarKai from '@/assets/avatars/kai.jpg';
import avatarRen from '@/assets/avatars/ren.jpg';
import sceneSnapCouch from '@/assets/scenes/snap-couch.jpg';

/* ---------- Reusable bits ---------- */

const PhoneFrame = memo(function PhoneFrame({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('relative mx-auto', className)}>
      <div className="relative w-[260px] sm:w-[280px] aspect-[9/19.5] rounded-[2.5rem] bg-[#0B0B10] border-[10px] border-[#1a1a22] shadow-[0_30px_80px_-20px_rgba(139,92,246,0.45)] overflow-hidden">
        {/* notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 h-5 w-24 bg-[#1a1a22] rounded-b-2xl z-20" />
        <div className="absolute inset-0 overflow-hidden rounded-[1.8rem]">{children}</div>
      </div>
    </div>
  );
});

/** Real polished screenshot rendered at the same footprint as PhoneFrame.
 *  The PNGs in /marketing/device/ already include a device frame + dynamic
 *  island + brand background, so we render them directly without wrapping. */
const RealPhone = memo(function RealPhone({
  src,
  alt,
  className,
  priority = false,
}: { src: string; alt: string; className?: string; priority?: boolean }) {
  return (
    <div className={cn('relative mx-auto', className)}>
      <img
        src={src}
        alt={alt}
        width={280}
        height={600}
        loading={priority ? 'eager' : 'lazy'}
        {...({ fetchpriority: priority ? 'high' : 'auto' } as any)}
        decoding="async"
        className="block w-[260px] sm:w-[280px] h-auto drop-shadow-[0_30px_80px_rgba(139,92,246,0.45)]"
      />
    </div>
  );
});

const SectionWrap = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <section className={cn('relative py-20 sm:py-28 px-6', className)}>
    <div className="max-w-7xl mx-auto">{children}</div>
  </section>
);

const FadeIn = ({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) => (
  <motion.div
    initial={{ opacity: 0, y: 24 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: '-80px' }}
    transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    className={className}
  >
    {children}
  </motion.div>
);

/* ---------- Fake people & scenes (real photos, fake identities) ---------- */

const PEOPLE = {
  maya:   { handle: '@maya.rae',  name: 'Maya R.',   img: avatarMaya },
  jordan: { handle: '@jordan.w',  name: 'Jordan W.', img: avatarJordan },
  leo:    { handle: '@leo.k',     name: 'Leo K.',    img: avatarLeo },
  sky:    { handle: '@sky.m',     name: 'Sky M.',    img: avatarSky },
  mia:    { handle: '@mia.z',     name: 'Mia Z.',    img: avatarMia },
  kai:    { handle: '@kai.t',     name: 'Kai T.',    img: avatarKai },
  ren:    { handle: '@ren.x',     name: 'Ren X.',    img: avatarRen },
};

const SCENES = {
  couch: sceneSnapCouch,
};

/** Square avatar that mimics the real <AvatarImage>. */
const Avatar = ({ src, className, alt = '' }: { src: string; className?: string; alt?: string }) => (
  <span className={cn('relative inline-block shrink-0 overflow-hidden rounded-full bg-white/5', className)}>
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className="absolute inset-0 aspect-square h-full w-full object-cover"
    />
  </span>
);

/** Back-compat alias used throughout the mocks. */
const Img = ({ src, className, alt = '' }: { src: string; className?: string; alt?: string }) =>
  className?.includes('rounded-full')
    ? <Avatar src={src} className={className} alt={alt} />
    : <img src={src} alt={alt} loading="lazy" decoding="async" className={cn('object-cover bg-white/5', className)} />;

/* ---------- Phone mockups (mirror the real app screens) ---------- */

const PhoneBottomNav = ({ active }: { active: 'home' | 'map' | 'create' | 'chat' | 'profile' }) => (
  <div className="absolute bottom-2 inset-x-3 h-12 rounded-full bg-[#15151c]/95 backdrop-blur-xl border border-white/5 flex items-center justify-around px-3 z-30 shadow-[0_8px_24px_rgba(0,0,0,0.5)]">
    <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center', active === 'home' && 'ring-1 ring-pink-400/70 shadow-[0_0_10px_rgba(236,72,153,0.5)]')}>
      <Home className={cn('w-4 h-4', active === 'home' ? 'text-pink-400' : 'text-white/45')} />
    </div>
    <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center', active === 'map' && 'ring-1 ring-cyan-400/70')}>
      <Search className={cn('w-4 h-4', active === 'map' ? 'text-cyan-300' : 'text-white/45')} />
    </div>
    <div className="-mt-5 w-11 h-11 rounded-2xl flex items-center justify-center shadow-[0_0_18px_rgba(236,72,153,0.6)]"
      style={{background:'linear-gradient(135deg, #EC4899, #8B5CF6)'}}>
      <Plus className="w-5 h-5 text-white" />
    </div>
    <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center', active === 'chat' && 'ring-1 ring-cyan-400/70')}>
      <MessageCircle className={cn('w-4 h-4', active === 'chat' ? 'text-cyan-300' : 'text-white/45')} />
    </div>
    <div className="w-7 h-7 rounded-full overflow-hidden ring-1 ring-white/10">
      <Img src={PEOPLE.maya.img} className="w-full h-full rounded-full" />
    </div>
  </div>
);

const StatusBar = () => (
  <div className="absolute top-0 inset-x-0 h-7 flex items-center justify-between px-5 z-20 text-white text-[10px] font-semibold pointer-events-none">
    <span>9:41</span>
    <span className="flex items-center gap-1 opacity-80">
      <span>5G</span>
      <span className="ml-1 w-4 h-2 rounded-sm border border-white/60 relative">
        <span className="absolute inset-[1px] right-0.5 bg-white rounded-[1px]" />
      </span>
    </span>
  </div>
);

// === DNA SCREEN — mirrors src/pages/VybeDNA.tsx ===
const DNAPhone = () => (
  <div className="w-full h-full bg-[#0B0B10] relative overflow-hidden">
    <StatusBar />
    <div className="absolute top-7 inset-x-0 h-10 bg-[#0B0B10]/80 backdrop-blur-xl border-b border-white/5 px-3 flex items-center gap-2 z-10">
      <ArrowLeft className="w-4 h-4 text-white/70" />
      <div className="flex-1 min-w-0">
        <div className="text-white text-[12px] font-bold flex items-center gap-1"><Sparkles className="w-3 h-3 text-violet-400" /> VYBE DNA</div>
        <div className="text-[8px] text-white/50">Evolves with your activity</div>
      </div>
      <Share2 className="w-3.5 h-3.5 text-white/70" />
    </div>
    <div className="absolute inset-0 pt-[72px] pb-16 px-3 overflow-hidden flex flex-col items-stretch gap-3">
      {/* Orbit + chip */}
      <div className="flex flex-col items-center gap-1.5">
        <div className="relative h-[100px] w-full flex items-center justify-center">
          <div className="absolute w-[90px] h-[90px] rounded-full blur-2xl opacity-60" style={{background:'radial-gradient(circle, #8B5CF6, transparent 70%)'}} />
          <div className="absolute w-[80px] h-[80px] rounded-full border border-violet-400/30" />
          <div className="absolute w-[100px] h-[100px] rounded-full border border-cyan-400/20" />
          <div className="relative w-14 h-14 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(139,92,246,0.7)]"
            style={{background:'conic-gradient(from 180deg, #8B5CF6, #EC4899, #06B6D4, #8B5CF6)'}}>
            <Dna className="w-6 h-6 text-white drop-shadow" />
          </div>
        </div>
        <div className="px-2 py-0.5 rounded-full bg-white/10 backdrop-blur border border-white/15 text-[8px] text-white/85">VYBE-7F2A</div>
      </div>
      {/* Archetype card */}
      <div className="rounded-xl overflow-hidden border border-white/10">
        <div className="bg-gradient-to-r from-violet-500 to-purple-500 p-2.5 flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center">
            <Lightbulb className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0">
            <div className="text-white/80 text-[7px] font-semibold uppercase tracking-wider">Your Archetype</div>
            <div className="text-white text-[12px] font-bold leading-tight">The Visionary</div>
          </div>
        </div>
        <div className="bg-[#15151c] p-2">
          <p className="text-[8.5px] text-white/65 leading-snug">A creative force that turns ideas into something unforgettable.</p>
        </div>
      </div>
      {/* Stats */}
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2 space-y-1.5">
        {[['Activity', 82, '#F59E0B'],['Social', 64, '#EC4899'],['Creative', 91, '#8B5CF6']].map(([t,v,c]) => (
          <div key={t as string}>
            <div className="flex justify-between text-[8px] text-white/70 mb-0.5">
              <span>{t}</span><span className="text-white/50">{v}%</span>
            </div>
            <div className="h-1 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${v}%`, background: c as string }} />
            </div>
          </div>
        ))}
      </div>
    </div>
    <PhoneBottomNav active="profile" />
  </div>
);

// === HOME — mirrors src/pages/Home.tsx (real screenshot layout) ===
const FeedPhone = () => (
  <div className="w-full h-full bg-[#0B0B10] relative overflow-hidden">
    <StatusBar />
    {/* Top header */}
    <div className="absolute top-7 inset-x-0 px-3 h-11 flex items-center gap-2 z-10 bg-[#0B0B10]/90 backdrop-blur-xl border-b border-white/5">
      <div className="font-display font-black text-lg leading-none bg-gradient-to-b from-violet-400 to-pink-400 bg-clip-text text-transparent">V</div>
      <div className="flex-1 h-7 rounded-full bg-white/[0.06] border border-white/5 flex items-center px-2.5 min-w-0">
        <Search className="w-3 h-3 text-white/40" />
      </div>
      <Bell className="w-4 h-4 text-white/60 shrink-0" />
      <div className="relative shrink-0">
        <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-pink-500/30 to-cyan-500/30 border border-pink-400/40 flex items-center justify-center">
          <Trophy className="w-3 h-3 text-pink-300" />
        </div>
        <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-gradient-to-br from-orange-500 to-pink-500 text-white text-[7px] font-black flex items-center justify-center">4</div>
      </div>
    </div>

    {/* Scroll body */}
    <div className="absolute inset-0 pt-[72px] pb-16 overflow-hidden">
      {/* Customize Home pill */}
      <div className="flex justify-center mb-3">
        <div className="px-3 py-1.5 rounded-full border border-pink-400/40 bg-pink-500/5 flex items-center gap-1.5">
          <div className="w-3.5 h-3.5 rounded-md bg-white/10 flex items-center justify-center">
            <div className="grid grid-cols-2 gap-[1px]">
              {[0,1,2,3].map(i => <div key={i} className="w-[2px] h-[2px] bg-pink-300 rounded-[0.5px]" />)}
            </div>
          </div>
          <span className="text-[8px] font-semibold text-pink-300">Customize Home</span>
        </div>
      </div>

      {/* Greeting row */}
      <div className="px-3 flex items-center gap-2 mb-2">
        <div className="relative shrink-0">
          <div className="w-9 h-9 rounded-full p-[1.5px] bg-gradient-to-br from-pink-500 to-violet-500">
            <Img src={PEOPLE.maya.img} className="w-full h-full rounded-full" />
          </div>
          <div className="absolute -bottom-1 -right-1 px-1 min-w-[14px] h-3.5 rounded-full bg-pink-500 text-white text-[7px] font-black flex items-center justify-center border border-[#0B0B10]">49</div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] leading-tight">
            <span className="text-white/90 font-medium">Good morning, </span>
            <span className="font-black text-pink-400">@you</span>
          </div>
          <div className="mt-0.5 h-[1.5px] w-full rounded-full bg-gradient-to-r from-pink-500/60 via-violet-500/60 to-cyan-500/60" />
          <div className="text-[7.5px] text-white/50 mt-0.5 flex items-center gap-1">🔥 1 person leveling up today</div>
        </div>
      </div>

      {/* Your story */}
      <div className="px-3 mb-2 mt-1">
        <div className="flex flex-col items-start gap-0.5">
          <div className="relative w-10 h-10">
            <Img src={PEOPLE.sky.img} className="w-full h-full rounded-full" />
            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-cyan-400 border-2 border-[#0B0B10] flex items-center justify-center"><Plus className="w-2 h-2 text-white" /></div>
          </div>
          <div className="text-[7px] text-white/80 font-semibold">Your story</div>
        </div>
      </div>

      {/* TOP XP */}
      <div className="px-3 mb-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-2 py-1.5 flex items-center gap-1.5">
          <Trophy className="w-3 h-3 text-white/40 shrink-0" />
          <span className="text-[7px] font-bold text-white/40 tracking-wider shrink-0">TOP XP</span>
          <span className="text-[8px] text-white/80 ml-1 truncate">@leo.k · 2,013 XP</span>
        </div>
      </div>

      {/* Daily Brief */}
      <div className="px-3 mb-2">
        <div className="h-7 rounded-full border border-violet-400/20 flex items-center justify-center gap-1.5"
          style={{background:'linear-gradient(90deg, rgba(139,92,246,0.18), rgba(6,182,212,0.18), rgba(139,92,246,0.18))'}}>
          <span className="text-[10px] font-display font-black bg-gradient-to-b from-violet-400 to-pink-400 bg-clip-text text-transparent">V</span>
          <span className="text-[8.5px] text-white font-medium">Your Daily Brief</span>
          <Globe className="w-2.5 h-2.5 text-cyan-300" />
          <span className="text-[7px] text-emerald-400">• Live</span>
        </div>
      </div>

      {/* Quick action grid */}
      <div className="px-3 grid grid-cols-2 gap-1.5 mb-2">
        {[
          { icon: Sparkles, label: 'VYBE DNA', tint: 'from-violet-500/30 to-pink-500/20', ring: 'ring-violet-400/30', iconBg: 'bg-violet-500' },
          { icon: ShoppingBag, label: 'Shop', tint: 'from-emerald-500/20 to-teal-500/10', ring: 'ring-emerald-400/20', iconBg: 'bg-emerald-500' },
          { icon: Radio, label: 'Communities', tint: 'from-cyan-500/20 to-blue-500/10', ring: 'ring-cyan-400/20', iconBg: 'bg-cyan-500' },
          { icon: Trophy, label: 'Challenges', tint: 'from-pink-500/25 to-orange-500/15', ring: 'ring-pink-400/30', iconBg: 'bg-pink-500' },
        ].map((q) => (
          <div key={q.label} className={cn('rounded-xl border border-white/10 px-2 py-2 bg-gradient-to-br', q.tint, 'ring-1', q.ring)}>
            <div className={cn('w-5 h-5 rounded-full flex items-center justify-center mb-1', q.iconBg)}>
              <q.icon className="w-2.5 h-2.5 text-white" />
            </div>
            <div className="text-[8px] font-bold text-white/85 text-center">{q.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="px-3 flex items-center gap-3 text-[8.5px]">
        <div className="px-2 py-1 rounded-full border border-pink-400/40 text-pink-300 font-bold flex items-center gap-1">
          <Sparkles className="w-2.5 h-2.5" /> For You
        </div>
        <div className="text-white/45 flex items-center gap-1"><MapPin className="w-2.5 h-2.5" /> Local</div>
        <div className="text-white/45 flex items-center gap-1"><Globe className="w-2.5 h-2.5" /> Global</div>
      </div>
    </div>
    <PhoneBottomNav active="home" />
  </div>
);

// === FRIEND MAP — mirrors src/pages/FriendMap.tsx ===
const MapPhone = () => (
  <div className="w-full h-full bg-[#0B0B10] relative overflow-hidden">
    <StatusBar />
    {/* Top: back, avatar, weather pill, layers */}
    <div className="absolute top-7 inset-x-0 px-2.5 h-11 flex items-center gap-2 z-10">
      <div className="w-7 h-7 rounded-full bg-[#15151c]/90 border border-white/10 flex items-center justify-center shrink-0">
        <ArrowLeft className="w-3.5 h-3.5 text-white/80" />
      </div>
      <div className="w-8 h-8 rounded-full p-[1.5px] bg-gradient-to-br from-pink-500 to-violet-500 shrink-0">
        <Img src={PEOPLE.maya.img} className="w-full h-full rounded-full" />
      </div>
      <div className="flex-1" />
      <div className="px-2 h-7 rounded-full bg-[#15151c]/90 border border-white/10 flex items-center gap-1 text-[9px] text-white shrink-0">
        <span>☀️</span> 73°F
      </div>
      <div className="w-7 h-7 rounded-full bg-[#15151c]/90 border border-white/10 flex items-center justify-center shrink-0">
        <Layers className="w-3.5 h-3.5 text-white/80" />
      </div>
    </div>

    {/* Tabs */}
    <div className="absolute top-[68px] inset-x-0 px-2.5 flex items-center gap-1.5 z-10 overflow-hidden">
      {[
        { k: 'Friends', active: true },
        { k: 'Trending' },
        { k: 'Memories' },
        { k: 'Popular' },
      ].map(t => (
        <div key={t.k} className={cn(
          'px-2.5 py-1 rounded-full text-[9px] font-semibold whitespace-nowrap',
          t.active ? 'bg-pink-500 text-white' : 'text-white/55'
        )}>{t.k}</div>
      ))}
    </div>

    {/* Map area — sits between tabs (top 100) and the friend strip (bottom 110) */}
    <div className="absolute inset-x-0 top-[100px] bottom-[110px]">
      <div className="absolute inset-0" style={{background:'linear-gradient(135deg, #0a0a12, #0B0B10)'}} />
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-[28%] left-[10%] w-[55%] h-[1px] bg-white/15 rotate-[8deg]" />
        <div className="absolute top-[42%] left-0 w-[80%] h-[1px] bg-white/15 -rotate-[3deg]" />
        <div className="absolute top-[10%] left-[45%] w-[1px] h-[60%] bg-white/15" />
        <div className="absolute top-[60%] left-[20%] w-[1px] h-[35%] bg-white/12 rotate-[20deg]" />
      </div>
      {[
        {t:'30%',l:'62%'},{t:'34%',l:'70%'},{t:'58%',l:'82%'},{t:'72%',l:'78%'},{t:'80%',l:'30%'},
      ].map((b,i)=>(<div key={i} className="absolute w-1.5 h-1.5 bg-white/10 rounded-[1px]" style={{top:b.t,left:b.l}} />))}
      {/* Centered pulse marker */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="absolute w-12 h-12 rounded-full bg-blue-500/20 -left-[18px] -top-[18px] animate-ping" />
        <div className="w-3 h-3 rounded-full bg-blue-400 border-2 border-blue-300 shadow-[0_0_12px_rgba(59,130,246,0.8)]" />
      </div>
      {/* Right action stack */}
      <div className="absolute right-2 top-3 flex flex-col gap-1.5">
        {[Send, Globe, Sparkles].map((I,i) => (
          <div key={i} className="w-7 h-7 rounded-full bg-[#15151c]/90 border border-white/10 flex items-center justify-center">
            <I className="w-3 h-3 text-white/70" />
          </div>
        ))}
      </div>
    </div>

    {/* Friend strip — clear of bottom nav (h-12 + bottom-2 = 56) */}
    <div className="absolute bottom-[68px] inset-x-0 px-2 flex justify-center gap-1.5 z-20">
      {[PEOPLE.sky, PEOPLE.leo, PEOPLE.mia, PEOPLE.kai, PEOPLE.ren, PEOPLE.jordan].map((p,i)=>(
        <div key={i} className="flex flex-col items-center gap-0.5 shrink-0">
          <div className="w-6 h-6 rounded-full ring-1 ring-white/15 overflow-hidden">
            <Img src={p.img} className="w-full h-full rounded-full" />
          </div>
          <div className="text-[6px] text-white/55 truncate max-w-[28px]">{p.handle.slice(1,6)}</div>
        </div>
      ))}
    </div>

    <PhoneBottomNav active="map" />
  </div>
);

// === FRIEND LINK — mirrors redesigned FriendDrop.tsx (QR + Tap radar) ===
const FriendLinkPhone = () => (
  <div className="w-full h-full bg-[#0B0B10] relative overflow-hidden">
    {/* Ambient glow */}
    <div className="absolute inset-0 pointer-events-none">
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[260px] h-[260px] rounded-full blur-3xl opacity-40"
        style={{background:'radial-gradient(circle, #8B5CF6 0%, transparent 70%)'}} />
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-[200px] h-[200px] rounded-full blur-3xl opacity-30"
        style={{background:'radial-gradient(circle, #06B6D4 0%, transparent 70%)'}} />
    </div>
    <StatusBar />
    {/* Header */}
    <div className="absolute top-7 inset-x-0 px-3 h-10 flex items-center gap-2 z-10">
      <ArrowLeft className="w-4 h-4 text-white/70" />
      <div className="flex-1 text-center">
        <div className="text-white text-[12px] font-bold">Add Friend</div>
        <div className="text-[7.5px] text-white/45">Scan or tap phones</div>
      </div>
      <div className="w-4 h-4" />
    </div>

    {/* Segmented tabs */}
    <div className="absolute top-[60px] inset-x-6 z-10">
      <div className="h-7 rounded-full bg-white/[0.05] border border-white/10 p-[2px] flex relative">
        <div className="absolute top-[2px] left-[2px] bottom-[2px] w-[calc(50%-2px)] rounded-full bg-gradient-to-r from-violet-500 to-cyan-500 shadow-[0_0_12px_rgba(139,92,246,0.6)]" />
        <div className="relative flex-1 flex items-center justify-center gap-1 text-[9px] font-bold text-white">
          <div className="w-2 h-2 rounded-[1px] border border-white" />
          QR Code
        </div>
        <div className="relative flex-1 flex items-center justify-center gap-1 text-[9px] font-semibold text-white/55">
          <Zap className="w-2.5 h-2.5" />
          Phone Tap
        </div>
      </div>
    </div>

    {/* QR + chip stack — vertically centered between header (top 100) and bottom action (bottom 60) */}
    <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 z-10 flex flex-col items-center gap-2">
      <div className="relative">
        <div className="absolute -inset-3 rounded-3xl blur-xl opacity-50"
          style={{background:'linear-gradient(135deg, #8B5CF6, #06B6D4)'}} />
        <div className="relative w-[150px] h-[150px] rounded-2xl bg-white p-2 shadow-2xl">
          <div className="relative w-full h-full rounded-lg overflow-hidden bg-white">
            <div className="absolute inset-0 grid grid-cols-[repeat(13,1fr)] grid-rows-[repeat(13,1fr)] gap-[1px] p-1">
              {Array.from({length: 169}).map((_, i) => {
                const on = ((i * 37 + (i % 7) * 13 + Math.floor(i / 13) * 17) % 5) < 2;
                return <div key={i} className={on ? 'bg-[#0B0B10] rounded-[1px]' : ''} />;
              })}
            </div>
            {['top-1 left-1','top-1 right-1','bottom-1 left-1'].map(pos => (
              <div key={pos} className={cn('absolute w-5 h-5 bg-white', pos)}>
                <div className="w-full h-full border-[2px] border-[#0B0B10] rounded-[3px] flex items-center justify-center">
                  <div className="w-2 h-2 bg-[#0B0B10] rounded-[1px]" />
                </div>
              </div>
            ))}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative">
                <div className="absolute -inset-1 rounded-full bg-white" />
                <div className="relative w-9 h-9 rounded-full p-[2px]"
                  style={{background:'conic-gradient(from 0deg, #8B5CF6, #EC4899, #06B6D4, #8B5CF6)'}}>
                  <Img src={PEOPLE.maya.img} className="w-full h-full rounded-full" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="px-2.5 py-0.5 rounded-full text-[8.5px] font-bold text-violet-300 bg-violet-500/15 border border-violet-400/30">
        @maya.rae
      </div>
    </div>

    {/* Bottom action */}
    <div className="absolute bottom-3 inset-x-3 z-10 space-y-1.5">
      <div className="h-9 rounded-2xl border border-white/10 bg-white/[0.04] flex items-center justify-center gap-1.5 backdrop-blur">
        <Camera className="w-3 h-3 text-white/70" />
        <span className="text-[9.5px] font-semibold text-white/85">Scan a code</span>
      </div>
      <div className="text-[7.5px] text-white/40 text-center flex items-center justify-center gap-1">
        <Zap className="w-2 h-2 text-cyan-300" /> NFC ready · hold phones together
      </div>
    </div>
  </div>
);

// === CHAT — mirrors ChatView.tsx ===
const ChatPhone = () => (
  <div className="w-full h-full bg-[#0B0B10] relative overflow-hidden">
    <StatusBar />
    <div className="absolute top-7 inset-x-0 h-12 bg-[#0B0B10]/80 backdrop-blur-xl border-b border-white/5 px-3 flex items-center gap-2 z-10">
      <ArrowLeft className="w-4 h-4 text-white/70 shrink-0" />
      <div className="relative shrink-0">
        <Img src={PEOPLE.jordan.img} className="w-7 h-7 rounded-full" />
        <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#0B0B10]" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-white text-[12px] font-semibold leading-tight truncate">{PEOPLE.jordan.name}</div>
        <div className="text-white/50 text-[8px] flex items-center gap-1">
          <Flame className="w-2.5 h-2.5 text-amber-400" /> 14d streak · active now
        </div>
      </div>
      <Camera className="w-4 h-4 text-white/70 shrink-0" />
    </div>
    {/* Messages — reserve room for input (40) + bottom nav (64) = 104 */}
    <div className="absolute inset-0 pt-[80px] pb-[112px] px-2.5 flex flex-col gap-1.5 justify-end overflow-hidden">
      <div className="self-center text-[8px] text-white/35 mb-1">Today</div>
      <div className="self-start max-w-[78%] bg-white/[0.07] rounded-2xl rounded-bl-md px-3 py-1.5 text-white text-[11px]">yo you up?</div>
      <div className="self-end max-w-[78%] rounded-2xl rounded-br-md px-3 py-1.5 text-white text-[11px]" style={{background:'linear-gradient(135deg, #8B5CF6, #06B6D4)'}}>always 🌙</div>
      <div className="self-start relative max-w-[78%] mb-2">
        <div className="bg-white/[0.07] rounded-2xl rounded-bl-md px-3 py-1.5 text-white text-[11px]">vibe check?</div>
        <div className="absolute -bottom-2 left-2 flex items-center gap-0.5 px-1 py-0.5 rounded-full bg-[#1a1a22] border border-white/10 text-[9px]">
          <span>🔥</span><span className="text-white/60 text-[8px]">3</span>
        </div>
      </div>
      <div className="self-end max-w-[68%] rounded-2xl overflow-hidden border border-white/10 shadow-lg">
        <div className="aspect-[4/5] relative">
          <Img src={SCENES.couch} alt="Friends laughing" className="absolute inset-0 w-full h-full" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30" />
          <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-full bg-black/50 backdrop-blur text-[8px] text-white flex items-center gap-1">
            <Camera className="w-2.5 h-2.5" /> VYBE Snap
          </div>
          <div className="absolute bottom-1.5 left-1.5 right-1.5 text-[9px] text-white/90">tap to view · 24h</div>
        </div>
      </div>
      <div className="self-start text-[8px] text-white/40 mt-1 ml-1">{PEOPLE.jordan.name.split(' ')[0]} is typing…</div>
    </div>
    {/* Message input — sits above the bottom nav */}
    <div className="absolute bottom-[60px] inset-x-0 px-2.5 z-20">
      <div className="rounded-full bg-white/5 border border-white/10 px-3 h-8 flex items-center gap-2">
        <Plus className="w-3.5 h-3.5 text-white/50 shrink-0" />
        <div className="text-white/40 text-[10px] flex-1 truncate">Message…</div>
        <Smile className="w-3.5 h-3.5 text-white/50 shrink-0" />
        <Mic className="w-3.5 h-3.5 text-white/50 shrink-0" />
      </div>
    </div>
    <PhoneBottomNav active="chat" />
  </div>
);

// === AURA — mirrors the Aura customizer (Bento + theme + motion) ===
const AuraPhone = () => (
  <div className="w-full h-full bg-[#0B0B10] relative overflow-hidden">
    {/* Live aura background */}
    <div className="absolute inset-0 opacity-60" style={{background:'conic-gradient(from 90deg at 50% 60%, rgba(139,92,246,0.35), rgba(236,72,153,0.25), rgba(6,182,212,0.3), rgba(139,92,246,0.35))', filter:'blur(40px)'}} />
    <StatusBar />
    {/* Header */}
    <div className="absolute top-7 inset-x-0 h-10 px-3 flex items-center gap-2 z-10">
      <ArrowLeft className="w-4 h-4 text-white/80" />
      <div className="flex-1 text-center">
        <div className="text-white text-[12px] font-bold flex items-center justify-center gap-1">
          <Palette className="w-3 h-3 text-violet-300" /> Edit Aura
        </div>
        <div className="text-[7.5px] text-white/55">Drag to rearrange</div>
      </div>
      <div className="px-2 h-6 rounded-full bg-violet-500 text-white text-[9px] font-bold flex items-center">Save</div>
    </div>

    {/* Profile header preview */}
    <div className="absolute top-[60px] inset-x-3 z-10 flex items-center gap-2 p-2 rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur">
      <div className="w-9 h-9 rounded-full p-[1.5px] bg-gradient-to-br from-violet-500 to-cyan-500 shrink-0">
        <Img src={PEOPLE.maya.img} className="w-full h-full rounded-full" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-white text-[11px] font-bold leading-tight truncate">@maya.rae</div>
        <div className="text-[8px] text-white/55">Lvl 49 · The Visionary</div>
      </div>
      <Sparkles className="w-3.5 h-3.5 text-violet-300" />
    </div>

    {/* Bento grid */}
    <div className="absolute top-[118px] inset-x-3 z-10 grid grid-cols-3 gap-1.5">
      {/* tall */}
      <div className="col-span-1 row-span-2 h-[112px] rounded-2xl border border-dashed border-violet-300/50 bg-gradient-to-br from-violet-500/30 to-pink-500/15 p-2 relative">
        <GripVertical className="absolute top-1 right-1 w-2.5 h-2.5 text-white/40" />
        <Heart className="w-3 h-3 text-pink-300 mb-1" />
        <div className="text-[8px] font-bold text-white">Loves</div>
        <div className="text-[7px] text-white/60">142 saved</div>
      </div>
      {/* wide */}
      <div className="col-span-2 h-[52px] rounded-2xl border border-dashed border-cyan-300/50 bg-gradient-to-br from-cyan-500/25 to-blue-500/10 p-2 relative">
        <GripVertical className="absolute top-1 right-1 w-2.5 h-2.5 text-white/40" />
        <div className="flex items-center gap-1.5">
          <Trophy className="w-3 h-3 text-amber-300" />
          <div className="text-[8px] font-bold text-white">Top XP this week</div>
        </div>
        <div className="text-[7px] text-white/60 mt-0.5">12,840 · #3 in Brooklyn</div>
      </div>
      {/* small x2 */}
      <div className="h-[52px] rounded-2xl border border-dashed border-emerald-300/50 bg-emerald-500/15 p-2 relative">
        <GripVertical className="absolute top-1 right-1 w-2.5 h-2.5 text-white/40" />
        <Flame className="w-3 h-3 text-amber-300 mb-0.5" />
        <div className="text-[8px] font-bold text-white">14d</div>
      </div>
      <div className="h-[52px] rounded-2xl border border-dashed border-pink-300/50 bg-pink-500/15 p-2 relative">
        <GripVertical className="absolute top-1 right-1 w-2.5 h-2.5 text-white/40" />
        <ImageIcon className="w-3 h-3 text-pink-200 mb-0.5" />
        <div className="text-[8px] font-bold text-white">Gallery</div>
      </div>
    </div>

    {/* Theme colors */}
    <div className="absolute bottom-[96px] inset-x-3 z-10">
      <div className="text-[8px] uppercase tracking-wider text-white/50 font-bold mb-1">Theme</div>
      <div className="flex items-center gap-2">
        {[
          {c:'linear-gradient(135deg,#8B5CF6,#EC4899)', active:true},
          {c:'linear-gradient(135deg,#06B6D4,#8B5CF6)'},
          {c:'linear-gradient(135deg,#F59E0B,#EC4899)'},
          {c:'linear-gradient(135deg,#10B981,#06B6D4)'},
          {c:'linear-gradient(135deg,#F43F5E,#7C3AED)'},
        ].map((s,i)=>(
          <div key={i} className={cn('w-7 h-7 rounded-full ring-2 ring-offset-2 ring-offset-[#0B0B10]', s.active ? 'ring-white' : 'ring-transparent')} style={{background:s.c}} />
        ))}
      </div>
    </div>

    {/* Motion preset chips */}
    <div className="absolute bottom-[64px] inset-x-3 z-10 flex items-center gap-1.5">
      {['Smooth','Bouncy','Snappy'].map((m,i)=>(
        <div key={m} className={cn('px-2 py-1 rounded-full text-[8.5px] font-semibold border',
          i===0 ? 'bg-violet-500/30 border-violet-300/60 text-white' : 'border-white/10 text-white/55')}>{m}</div>
      ))}
    </div>

    <PhoneBottomNav active="profile" />
  </div>
);

// === SNAP · NOTES · CALLS ===
const SnapPhone = () => (
  <div className="w-full h-full bg-[#0B0B10] relative overflow-hidden">
    {/* Ambient warm glow */}
    <div className="absolute inset-0 opacity-50" style={{background:'radial-gradient(ellipse at 50% 30%, rgba(236,72,153,0.4), transparent 60%), radial-gradient(ellipse at 50% 80%, rgba(6,182,212,0.25), transparent 60%)'}} />
    <StatusBar />

    {/* Incoming call card */}
    <div className="absolute top-9 inset-x-3 z-10 rounded-2xl border border-white/10 bg-[#15151c]/85 backdrop-blur-xl p-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.5)]">
      <div className="flex items-center gap-2">
        <div className="relative shrink-0">
          <div className="absolute -inset-1 rounded-full bg-emerald-400/40 animate-ping" />
          <div className="relative w-9 h-9 rounded-full p-[1.5px] bg-gradient-to-br from-emerald-400 to-cyan-400">
            <Img src={PEOPLE.kai.img} className="w-full h-full rounded-full" />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-white text-[11px] font-bold leading-tight truncate">{PEOPLE.kai.name}</div>
          <div className="text-emerald-300 text-[8px] flex items-center gap-1"><Phone className="w-2.5 h-2.5" /> Calling…</div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <div className="w-7 h-7 rounded-full bg-rose-500 flex items-center justify-center"><Phone className="w-3 h-3 text-white rotate-[135deg]" /></div>
          <div className="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center shadow-[0_0_12px_rgba(16,185,129,0.7)]"><Phone className="w-3 h-3 text-white" /></div>
        </div>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400" />
      </div>
      <div className="mt-1 text-[7.5px] text-white/45 text-center">Slide to answer</div>
    </div>

    {/* Floating GIF Note */}
    <div className="absolute top-[150px] left-3 z-10 flex items-end gap-1.5">
      <div className="w-7 h-7 rounded-full ring-2 ring-pink-400/60 overflow-hidden shrink-0">
        <Img src={PEOPLE.mia.img} className="w-full h-full rounded-full" />
      </div>
      <div className="relative">
        <div className="rounded-2xl rounded-bl-sm overflow-hidden border border-white/10 shadow-lg w-[120px] h-[80px] relative bg-gradient-to-br from-fuchsia-500/40 via-violet-500/30 to-cyan-500/40">
          <div className="absolute inset-0 flex items-center justify-center text-2xl">🎉</div>
          <div className="absolute top-1 left-1 px-1 py-0.5 rounded-full bg-black/50 text-[7px] text-white font-semibold flex items-center gap-0.5">
            <ImageIcon className="w-2 h-2" /> GIF
          </div>
          <div className="absolute -bottom-1.5 -right-1.5 px-1.5 py-0.5 rounded-full bg-[#1a1a22] border border-white/15 text-[8px] flex items-center gap-0.5">
            <Flame className="w-2.5 h-2.5 text-amber-300" /><span className="text-white/80">7</span>
          </div>
        </div>
        <div className="text-[7px] text-white/45 mt-1.5 ml-1">{PEOPLE.mia.handle} · 12s ago</div>
      </div>
    </div>

    {/* Disappearing snap */}
    <div className="absolute bottom-[88px] right-3 z-10">
      <div className="text-[7px] text-white/45 mb-1 text-right">From {PEOPLE.sky.handle}</div>
      <div className="relative w-[110px] h-[150px] rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
        <Img src={SCENES.couch} alt="Snap" className="absolute inset-0 w-full h-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30" />
        {/* Countdown ring */}
        <div className="absolute top-1.5 left-1.5">
          <div className="relative w-6 h-6">
            <svg viewBox="0 0 24 24" className="absolute inset-0 -rotate-90">
              <circle cx="12" cy="12" r="10" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
              <circle cx="12" cy="12" r="10" fill="none" stroke="#EC4899" strokeWidth="2" strokeDasharray="62.8" strokeDashoffset="20" strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-[8px] text-white font-bold">7</div>
          </div>
        </div>
        <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between">
          <span className="text-[8px] text-white/90 font-semibold">VYBE Snap</span>
          <Camera className="w-3 h-3 text-white" />
        </div>
      </div>
    </div>

    <PhoneBottomNav active="chat" />
  </div>
);


/* ---------- Page ---------- */

const features = [
  { icon: Dna, label: 'VYBE DNA', desc: 'Evolving personality engine' },
  { icon: Sparkles, label: 'Aura', desc: 'Customize every pixel' },
  { icon: MapPin, label: 'Friend Map', desc: 'See who\'s nearby' },
  { icon: Camera, label: 'VYBE Snap', desc: 'Ephemeral moments' },
  { icon: Radio, label: 'Communities', desc: 'Your clubhouse' },
  { icon: PlayCircle, label: 'Clips', desc: '9:16 vertical video' },
  { icon: ShoppingBag, label: 'Marketplace', desc: 'Shop from creators' },
  { icon: Wallet, label: 'Wallet & Tips', desc: 'Real creator payouts' },
  { icon: Bot, label: 'VYBE AI', desc: 'Multimodal assistant' },
  { icon: Palette, label: 'Themes', desc: 'Share your look' },
  { icon: Flame, label: 'Streaks', desc: '48h reaction chains' },
  { icon: Shuffle, label: 'Roulette', desc: 'Meet someone new' },
  { icon: Trophy, label: 'Challenges', desc: 'Daily & weekly XP quests' },
  { icon: Crown, label: 'VYBE Pro', desc: 'Coming soon', soon: true },
  { icon: ShieldCheck, label: 'Vybe Check', desc: 'Real-time safety AI' },
  { icon: Bell, label: 'Smart Notifs', desc: 'Quiet by default' },
];

const VybeHome = memo(function VybeHome() {
  const { data: liveUserCount, isLoading: countLoading } = usePublicUserCount();
  const { data: topCreators } = useLandingTopCreators(4);
  // Fallback demo faces fill any empty slots so the row never looks empty.
  const demoFallback = [PEOPLE.maya, PEOPLE.jordan, PEOPLE.leo, PEOPLE.sky];
  const earlyMemberAvatars = (() => {
    const real = (topCreators ?? [])
      .filter((c) => !!c.avatar_url)
      .slice(0, 4)
      .map((c) => ({ key: c.id, src: c.avatar_url as string, alt: c.display_name || c.username || 'Creator' }));
    const filled = [...real];
    for (let i = 0; filled.length < 4 && i < demoFallback.length; i++) {
      const p = demoFallback[i];
      filled.push({ key: `demo-${p.handle}`, src: p.img, alt: p.name });
    }
    return filled;
  })();
  usePageMeta({
    title: 'VYBE — The social app that becomes you',
    description: 'Evolving DNA, custom Aura, real friends nearby, ephemeral snaps, and creator tools — VYBE is the social app that becomes you.',
    canonicalPath: '/',
  });
  return (
    <div className="page-scroll-fix bg-[#0B0B10] text-white">
      {/* Sticky nav */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-[#0B0B10]/80 border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/vybe-home" className="font-display font-black text-xl tracking-tight">
            <span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">VYBE</span>
          </Link>
          <nav className="hidden md:flex items-center gap-7 text-sm text-white/70">
            <a href="#features" className="hover:text-white transition">Features</a>
            <a href="#why" className="hover:text-white transition">Why VYBE</a>
            <Link to="/safety" className="hover:text-white transition">Safety</Link>
            <Link to="/blog" className="hover:text-white transition">Blog</Link>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/login" className="hidden sm:block px-4 py-2 text-sm text-white/80 hover:text-white transition">Sign in</Link>
            <Link to="/signup" className="px-4 py-2 rounded-full text-sm font-semibold bg-white text-[#0B0B10] hover:scale-105 transition">
              Get VYBE
            </Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative pt-20 sm:pt-28 pb-16 px-6 overflow-hidden">
        {/* Ambient gradients */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full blur-3xl opacity-30"
            style={{background:'radial-gradient(circle, #8B5CF6 0%, transparent 70%)'}} />
          <div className="absolute top-40 right-1/4 w-[500px] h-[500px] rounded-full blur-3xl opacity-25"
            style={{background:'radial-gradient(circle, #06B6D4 0%, transparent 70%)'}} />
        </div>
        <div className="max-w-7xl mx-auto relative grid lg:grid-cols-2 gap-12 items-center">
          <FadeIn>
            <div className="inline-flex items-center gap-3 pl-1.5 pr-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-white/70 mb-6">
              <div className="flex -space-x-2">
                {earlyMemberAvatars.map((a) => (
                  <Img key={a.key} src={a.src} alt={a.alt} className="w-6 h-6 rounded-full border-2 border-[#0B0B10]" />
                ))}
              </div>
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                {countLoading
                  ? 'Joining a small, growing crew'
                  : `${(liveUserCount ?? 0).toLocaleString()} ${liveUserCount === 1 ? 'early member' : 'early members'}`}
              </span>
            </div>
            <h1 className="font-display font-black text-5xl sm:text-6xl lg:text-7xl leading-[1.05] tracking-tight">
              The social app that
              <span className="block bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">
                becomes you.
              </span>
            </h1>
            <p className="mt-6 text-lg text-white/70 max-w-xl leading-relaxed">
              VYBE has a living personality engine, a friend map, ephemeral snaps,
              custom themes, creator tools, and AI — all wrapped in a UI that morphs to match your vibe.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/signup" className="px-6 py-3.5 rounded-full bg-gradient-to-r from-violet-500 to-cyan-500 text-white font-semibold flex items-center gap-2 hover:scale-105 transition shadow-lg shadow-violet-500/30">
                Create your VYBE <ArrowRight className="w-4 h-4" />
              </Link>
              <a href="#features" className="px-6 py-3.5 rounded-full bg-white/5 border border-white/10 text-white font-semibold hover:bg-white/10 transition">
                See what's inside
              </a>
            </div>
            <div className="mt-8 flex items-center gap-6 text-xs text-white/50">
              <div className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-400" /> End-to-end encrypted DMs</div>
              <div className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-400" /> Built for Gen Z creators</div>
              <div className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-400" /> AI-powered safety</div>
            </div>
          </FadeIn>

          {/* Hero phones — fixed-size centered stage */}
          <FadeIn delay={0.1}>
            <div className="hidden lg:flex justify-center">
              <div className="relative w-[600px] h-[620px]">
                <motion.div animate={{y:[0,-12,0]}} transition={{duration:6,repeat:Infinity,ease:'easeInOut'}}
                  className="absolute left-0 top-10 z-10">
                  <RealPhone src="/marketing/device/home.png" alt="VYBE home feed" priority />
                </motion.div>
                <motion.div animate={{y:[0,12,0]}} transition={{duration:7,repeat:Infinity,ease:'easeInOut',delay:0.5}}
                  className="absolute right-0 top-0 z-20">
                  <RealPhone src="/marketing/device/messages.png" alt="VYBE encrypted chat" />
                </motion.div>
                <motion.div animate={{y:[0,-8,0]}} transition={{duration:8,repeat:Infinity,ease:'easeInOut',delay:1}}
                  className="absolute left-1/2 -translate-x-1/2 bottom-0 z-30">
                  <RealPhone src="/marketing/device/map.png" alt="VYBE friend map" />
                </motion.div>
              </div>
            </div>
            <div className="lg:hidden flex justify-center">
              <RealPhone src="/marketing/device/home.png" alt="VYBE home feed" priority />
            </div>
          </FadeIn>
        </div>
      </section>

      {/* SOCIAL PROOF STRIP */}
      <section className="py-10 px-6 border-y border-white/5 bg-white/[0.02]">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
          {[
            {n: countLoading ? '—' : (liveUserCount ?? 0).toLocaleString(), l: liveUserCount === 1 ? 'Early member' : 'Early members'},
            {n:'24/7', l:'AI safety scanning'},
            {n:'E2E', l:'Encrypted messages'},
          ].map(s => (
            <div key={s.l}>
              <div className="font-display font-black text-3xl bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">{s.n}</div>
              <div className="text-xs text-white/50 mt-1 uppercase tracking-wider">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURE BLOCKS */}
      <SectionWrap>
        <FadeIn>
          <FeatureRow
            tag="VYBE DNA"
            title="An app that learns who you are."
            desc="Every reaction, share, and second of attention shapes your personal DNA. Your feed, friend suggestions, and even the UI itself evolve to match. Nobody else has this."
            bullets={['30-day evolving personality vector','Re-skins your feed automatically','Shareable DNA card you\'ll want to post']}
            phone={<RealPhone src="/marketing/device/dna.png" alt="VYBE DNA personality screen" />}
          />
        </FadeIn>
      </SectionWrap>

      <SectionWrap className="bg-gradient-to-b from-transparent via-violet-500/5 to-transparent">
        <FadeIn>
          <FeatureRow
            reverse
            tag="Aura"
            title="Make it look like you. Not like everyone else."
            desc="Drag, drop, theme, animate. Your profile is a living canvas — Bento grid blocks, custom backgrounds, shareable themes, motion presets. Templates are dead."
            bullets={['Framer Motion bento blocks','Share your theme with friends','Live aura backgrounds']}
            phone={<RealPhone src="/marketing/device/profile.png" alt="VYBE profile aura customization" />}
          />
        </FadeIn>
      </SectionWrap>

      <SectionWrap>
        <FadeIn>
          <FeatureRow
            tag="Friend Link · QR · NFC"
            title="Add friends in one tap. Literally."
            desc="A sleek Friend Link sheet with an instant QR code and a live tap radar. Hold phones together for NFC. Scan in under a second. No usernames, no typing, no friction."
            bullets={['Instant local QR with your avatar inset','Tap-to-add via NFC + native bridge','Realtime sync — both phones celebrate together']}
            phone={<PhoneFrame><FriendLinkPhone /></PhoneFrame>}
          />
        </FadeIn>
      </SectionWrap>

      <SectionWrap className="bg-gradient-to-b from-transparent via-cyan-500/5 to-transparent">
        <FadeIn>
          <FeatureRow
            reverse
            tag="Snap · Notes · Calls"
            title="The closest thing to actually being there."
            desc="Disappearing snaps. GIF notes that float on the chat. Crystal-clear calls that connect in under a second. Multi-emoji reactions, swipe-replies, and reaction streaks that keep the vibe alive."
            bullets={['48-hour reaction streaks','End-to-end encrypted messages','GIF notes that float on the chat']}
            phone={<RealPhone src="/marketing/device/clips.png" alt="VYBE clips and snaps" />}
          />
        </FadeIn>
      </SectionWrap>

      {/* FEATURE GRID */}
      <SectionWrap>
        <div id="features" />
        <FadeIn>
          <div className="text-center mb-14">
            <div className="text-xs uppercase tracking-widest text-violet-400 mb-3 font-semibold">Everything you need</div>
            <h2 className="font-display font-black text-4xl sm:text-5xl">One app. All the vibes.</h2>
            <p className="text-white/60 mt-4 max-w-2xl mx-auto">Stop juggling six apps. VYBE bundles social, chat, video, commerce, and creator tools into a single coherent experience.</p>
          </div>
        </FadeIn>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {features.map((f, i) => (
            <FadeIn key={f.label} delay={i * 0.03}>
              <div className="group relative h-full p-5 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-violet-400/40 hover:bg-white/[0.06] transition-all hover:-translate-y-1">
                {(f as any).soon && (
                  <span className="absolute top-2 right-2 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-gradient-to-r from-violet-500/30 to-cyan-500/30 border border-white/15 text-white/80 font-semibold">Soon</span>
                )}
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-cyan-500/20 border border-white/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <f.icon className="w-5 h-5 text-violet-300" />
                </div>
                <div className="font-semibold text-white text-sm">{f.label}</div>
                <div className="text-xs text-white/50 mt-1">{f.desc}</div>
              </div>
            </FadeIn>
          ))}
        </div>
      </SectionWrap>

      {/* WHY NOT JUST USE COMPARISON */}
      <SectionWrap className="bg-white/[0.02] border-y border-white/5">
        <div id="why" />
        <FadeIn>
          <div className="text-center mb-12">
            <div className="text-xs uppercase tracking-widest text-cyan-400 mb-3 font-semibold">Why VYBE</div>
            <h2 className="font-display font-black text-4xl sm:text-5xl">"Why not just use ___?"</h2>
            <p className="text-white/60 mt-4">Because none of them do this:</p>
          </div>
        </FadeIn>
        <div className="overflow-x-auto">
          <table className="w-full max-w-4xl mx-auto text-sm">
            <thead>
              <tr className="text-white/70 text-xs uppercase tracking-wider">
                <th className="text-left p-4">Feature</th>
                <th className="p-4">Instagram</th>
                <th className="p-4">Snap</th>
                <th className="p-4">Discord</th>
                <th className="p-4 bg-gradient-to-br from-violet-500/20 to-cyan-500/20 rounded-t-xl">VYBE</th>
              </tr>
            </thead>
            <tbody className="text-white/80">
              {[
                ['Evolving personality engine', false, false, false],
                ['Tap-to-add (NFC bump)', false, false, false],
                ['Customizable everything', false, false, false],
                ['Disappearing snaps', false, true, false],
                ['Communities & spaces', false, false, true],
                ['Creator payouts (60-70%)', false, false, false],
                ['AI assistant trained on your DNA', false, false, false],
              ].map((row, i) => (
                <tr key={i} className="border-t border-white/5">
                  <td className="text-left p-4 font-medium">{row[0]}</td>
                  {row.slice(1).map((v, j) => (
                    <td key={j} className="p-4 text-center">
                      {v ? <Check className="w-4 h-4 text-white/70 inline" /> : <X className="w-4 h-4 text-white/30 inline" />}
                    </td>
                  ))}
                  <td className="p-4 text-center bg-gradient-to-br from-violet-500/10 to-cyan-500/10">
                    <Check className="w-5 h-5 text-emerald-400 inline" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionWrap>

      {/* SAFETY STRIP */}
      <SectionWrap>
        <FadeIn>
          <div className="rounded-3xl p-8 sm:p-12 bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 border border-emerald-400/20 grid md:grid-cols-[auto_1fr] gap-8 items-center">
            <div className="w-20 h-20 rounded-2xl bg-emerald-400/10 border border-emerald-400/30 flex items-center justify-center">
              <ShieldCheck className="w-10 h-10 text-emerald-400" />
            </div>
            <div>
              <h3 className="font-display font-bold text-2xl mb-2">Safe by default. Always.</h3>
              <p className="text-white/70 leading-relaxed">
                Every photo, video, and message is scanned by VYBE Check before it lands.
                Real parental controls, age-aware filters, and a 2-tap block flow.
                Built for the next generation, not the last one.
              </p>
            </div>
          </div>
        </FadeIn>
      </SectionWrap>

      {/* FINAL CTA */}
      <section className="px-6 pb-24">
        <FadeIn>
          <div className="max-w-5xl mx-auto rounded-[2.5rem] p-12 sm:p-20 text-center relative overflow-hidden border border-white/10"
            style={{background:'radial-gradient(ellipse at top, rgba(139,92,246,0.4), transparent 60%), radial-gradient(ellipse at bottom, rgba(6,182,212,0.3), transparent 60%), #0B0B10'}}>
            <div className="absolute inset-0 opacity-20" style={{
              backgroundImage:'radial-gradient(circle at 20% 30%, white 1px, transparent 1px), radial-gradient(circle at 70% 60%, white 1px, transparent 1px)',
              backgroundSize:'40px 40px',
            }} />
            <div className="relative">
              <h2 className="font-display font-black text-4xl sm:text-6xl leading-tight">
                Make it
                <span className="bg-gradient-to-r from-violet-300 to-cyan-300 bg-clip-text text-transparent"> yours.</span>
              </h2>
              <p className="mt-5 text-white/70 text-lg max-w-xl mx-auto">
                Join the people building a social app that finally feels like them.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link to="/signup" className="px-8 py-4 rounded-full bg-white text-[#0B0B10] font-bold hover:scale-105 transition flex items-center gap-2">
                  Create your VYBE <ArrowRight className="w-4 h-4" />
                </Link>
                <Link to="/login" className="px-8 py-4 rounded-full bg-white/10 border border-white/20 text-white font-semibold hover:bg-white/20 transition">
                  Open web app
                </Link>
              </div>
            </div>
          </div>
        </FadeIn>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/5 py-10 px-6 text-sm text-white/50">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row gap-6 justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="font-display font-black bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">VYBE</span>
            <span className="text-white/60">© 2026</span>
          </div>
          <div className="flex flex-wrap gap-5">
            <Link to="/about" className="hover:text-white">About</Link>
            <Link to="/features" className="hover:text-white">Features</Link>
            <Link to="/safety" className="hover:text-white">Safety</Link>
            <Link to="/privacy" className="hover:text-white">Privacy</Link>
            <Link to="/terms" className="hover:text-white">Terms</Link>
            <Link to="/contact" className="hover:text-white">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
});

/* ---------- Feature Row helper ---------- */

function FeatureRow({
  tag, title, desc, bullets, phone, reverse,
}: {
  tag: string; title: string; desc: string; bullets: string[]; phone: React.ReactNode; reverse?: boolean;
}) {
  return (
    <div className={cn('grid lg:grid-cols-2 gap-12 items-center', reverse && 'lg:[&>*:first-child]:order-2')}>
      <div>
        <div className="text-xs uppercase tracking-widest text-violet-400 font-semibold mb-3">{tag}</div>
        <h3 className="font-display font-black text-3xl sm:text-5xl leading-tight tracking-tight">{title}</h3>
        <p className="mt-5 text-white/70 text-lg leading-relaxed">{desc}</p>
        <ul className="mt-6 space-y-3">
          {bullets.map(b => (
            <li key={b} className="flex items-start gap-3 text-white/80">
              <div className="mt-1 w-5 h-5 rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center shrink-0">
                <Check className="w-3 h-3 text-white" />
              </div>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex justify-center">{phone}</div>
    </div>
  );
}

export default VybeHome;
