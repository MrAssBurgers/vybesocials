import { memo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Dna, Sparkles, MapPin, MessageCircle, Radio, ShoppingBag, Wallet, Bot,
  Palette, Flame, Shuffle, Trophy, Camera, ShieldCheck, Heart, Users,
  Zap, Crown, Bell, PlayCircle, ArrowRight, Check, X, Home, Plus, User,
  Search, Send, Bookmark, Share2, MoreHorizontal, ArrowLeft, Lightbulb,
  Globe, Mic, Smile,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePublicUserCount } from '@/hooks/usePublicUserCount';

/* ---------- Reusable bits ---------- */

const PhoneFrame = memo(function PhoneFrame({
  children,
  className,
  tilt = 0,
}: {
  children: React.ReactNode;
  className?: string;
  tilt?: number;
}) {
  return (
    <div
      className={cn('relative mx-auto', className)}
      style={{ transform: `rotate(${tilt}deg)` }}
    >
      <div className="relative w-[260px] sm:w-[280px] aspect-[9/19.5] rounded-[2.5rem] bg-[#0B0B10] border-[10px] border-[#1a1a22] shadow-[0_30px_80px_-20px_rgba(139,92,246,0.45)] overflow-hidden">
        {/* notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 h-5 w-24 bg-[#1a1a22] rounded-b-2xl z-20" />
        <div className="absolute inset-0 overflow-hidden rounded-[1.8rem]">{children}</div>
      </div>
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
  maya:   { handle: '@maya.rae',  name: 'Maya R.',   img: 'https://i.pravatar.cc/240?img=47' },
  jordan: { handle: '@jordan.w',  name: 'Jordan W.', img: 'https://i.pravatar.cc/240?img=12' },
  leo:    { handle: '@leo.k',     name: 'Leo K.',    img: 'https://i.pravatar.cc/240?img=33' },
  sky:    { handle: '@sky.m',     name: 'Sky M.',    img: 'https://i.pravatar.cc/240?img=49' },
  mia:    { handle: '@mia.z',     name: 'Mia Z.',    img: 'https://i.pravatar.cc/240?img=44' },
  kai:    { handle: '@kai.t',     name: 'Kai T.',    img: 'https://i.pravatar.cc/240?img=15' },
  ren:    { handle: '@ren.x',     name: 'Ren X.',    img: 'https://i.pravatar.cc/240?img=68' },
};

const SCENES = {
  rooftop:  'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=600&q=80&auto=format&fit=crop',
  picnic:   'https://images.unsplash.com/photo-1543807535-eceef0bc6599?w=600&q=80&auto=format&fit=crop',
  couch:    'https://images.unsplash.com/photo-1543269865-cbf427effbad?w=600&q=80&auto=format&fit=crop',
  cafe:     'https://images.unsplash.com/photo-1511632765486-a01980e01a18?w=600&q=80&auto=format&fit=crop',
};

/**
 * Avatar — square, object-cover, exactly like the real <AvatarImage> in src/components/ui/avatar.tsx
 * Use for ALL person photos in mockups so they look screenshot-cropped.
 */
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

/**
 * Thumb — fixed-aspect media tile (square by default), matches real PostCard / ChatMediaBubble crop rules.
 */
const Thumb = ({
  src,
  className,
  alt = '',
  ratio = 'aspect-square',
}: { src: string; className?: string; alt?: string; ratio?: string }) => (
  <span className={cn('relative block overflow-hidden bg-white/5', ratio, className)}>
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className="absolute inset-0 h-full w-full object-cover"
    />
  </span>
);

// Back-compat alias used throughout this file.
const Img = ({ src, className, alt = '' }: { src: string; className?: string; alt?: string }) =>
  className?.includes('rounded-full')
    ? <Avatar src={src} className={className} alt={alt} />
    : <img src={src} alt={alt} loading="lazy" decoding="async" className={cn('object-cover bg-white/5', className)} />;

/* ---------- Phone mockups (mirror the real app screens) ---------- */

const PhoneBottomNav = ({ active }: { active: 'home' | 'map' | 'create' | 'chat' | 'profile' }) => {
  const items: { k: 'home' | 'map' | 'create' | 'chat' | 'profile'; icon: typeof Home; accent?: boolean }[] = [
    { k: 'home', icon: Home },
    { k: 'map', icon: MapPin },
    { k: 'create', icon: Plus, accent: true },
    { k: 'chat', icon: MessageCircle },
    { k: 'profile', icon: User },
  ];
  return (
    <div className="absolute bottom-0 inset-x-0 h-12 bg-[#0B0B10]/90 backdrop-blur-xl border-t border-white/5 flex items-center justify-around px-2 z-10">
      {items.map(({ k, icon: Icon, accent }) => (
        <div key={k} className={cn(
          'flex items-center justify-center rounded-full transition',
          accent ? 'w-8 h-8 bg-gradient-to-br from-violet-500 to-cyan-500 shadow-[0_0_12px_rgba(139,92,246,0.6)]' : 'w-7 h-7',
        )}>
          <Icon className={cn('w-4 h-4', accent ? 'text-white' : active === k ? 'text-white' : 'text-white/40')} />
        </div>
      ))}
    </div>
  );
};

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
      <div className="flex-1">
        <div className="text-white text-[12px] font-bold flex items-center gap-1"><Sparkles className="w-3 h-3 text-violet-400" /> VYBE DNA</div>
        <div className="text-[8px] text-white/50">Evolves with your activity</div>
      </div>
      <Share2 className="w-3.5 h-3.5 text-white/70" />
    </div>
    <div className="absolute inset-0 pt-[68px] pb-12 px-3 overflow-hidden flex flex-col gap-2.5">
      <div className="relative h-[110px] flex items-center justify-center">
        <div className="absolute w-[90px] h-[90px] rounded-full blur-2xl opacity-60" style={{background:'radial-gradient(circle, #8B5CF6, transparent 70%)'}} />
        <div className="absolute w-[80px] h-[80px] rounded-full border border-violet-400/30" />
        <div className="absolute w-[100px] h-[100px] rounded-full border border-cyan-400/20" />
        <div className="w-14 h-14 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(139,92,246,0.7)]"
          style={{background:'conic-gradient(from 180deg, #8B5CF6, #EC4899, #06B6D4, #8B5CF6)'}}>
          <Dna className="w-6 h-6 text-white drop-shadow" />
        </div>
        <div className="absolute -bottom-1 px-2 py-0.5 rounded-full bg-white/10 backdrop-blur border border-white/15 text-[8px] text-white/85">VYBE-7F2A</div>
      </div>
      <div className="rounded-xl overflow-hidden border border-white/10">
        <div className="bg-gradient-to-r from-violet-500 to-purple-500 p-2.5 flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center">
            <Lightbulb className="h-4 w-4 text-white" />
          </div>
          <div>
            <div className="text-white/80 text-[7px] font-semibold uppercase tracking-wider">Your Archetype</div>
            <div className="text-white text-[12px] font-bold leading-tight">The Visionary</div>
          </div>
        </div>
        <div className="bg-[#15151c] -mt-1 p-2 rounded-t-lg relative">
          <p className="text-[8.5px] text-white/65 leading-snug">A creative force that turns ideas into something unforgettable.</p>
        </div>
      </div>
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

// === HOME FEED — mirrors src/pages/Home.tsx ===
const FeedPhone = () => (
  <div className="w-full h-full bg-[#0B0B10] relative overflow-hidden">
    <StatusBar />
    <div className="absolute top-7 inset-x-0 px-3 h-10 flex items-center justify-between z-10">
      <div className="font-display font-black text-base bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">VYBE</div>
      <div className="flex gap-1.5 items-center">
        <Search className="w-4 h-4 text-white/60" />
        <Bell className="w-4 h-4 text-white/60" />
        <Img src={PEOPLE.maya.img} className="w-6 h-6 rounded-full ring-1 ring-white/20" />
      </div>
    </div>
    <div className="absolute top-[68px] inset-x-0 px-3 flex gap-1.5 z-10">
      {[
        { k: 'For You', active: true },
        { k: 'Following' },
        { k: 'Global' },
        { k: 'Local' },
      ].map(t => (
        <div key={t.k} className={cn(
          'px-2.5 py-1 rounded-full text-[9px] font-semibold border',
          t.active ? 'bg-white text-[#0B0B10] border-white' : 'bg-white/5 text-white/60 border-white/10'
        )}>{t.k}</div>
      ))}
    </div>
    <div className="absolute inset-0 pt-[100px] pb-12 px-2 overflow-hidden">
      <div className="flex gap-2 px-1 mb-2">
        {[
          {p:PEOPLE.maya, n:'You'},
          {p:PEOPLE.sky, n:'sky'},
          {p:PEOPLE.leo, n:'leo'},
          {p:PEOPLE.mia, n:'mia'},
          {p:PEOPLE.kai, n:'kai'},
        ].map((s,i)=>(
          <div key={i} className="flex flex-col items-center gap-0.5 shrink-0">
            <div className="w-10 h-10 rounded-full p-[1.5px]" style={{background:'conic-gradient(from 0deg, #8B5CF6, #EC4899, #06B6D4, #8B5CF6)'}}>
              <div className="w-full h-full rounded-full bg-[#0B0B10] p-[1px]">
                <Img src={s.p.img} className="w-full h-full rounded-full" />
              </div>
            </div>
            <div className="text-[7px] text-white/60 truncate max-w-[36px]">{s.n}</div>
          </div>
        ))}
      </div>
      <div className="rounded-2xl overflow-hidden bg-white/[0.04] border border-white/10">
        <div className="flex items-center gap-2 p-2">
          <Img src={PEOPLE.maya.img} className="w-7 h-7 rounded-full" />
          <div className="flex-1">
            <div className="text-white text-[11px] font-semibold leading-tight">{PEOPLE.maya.handle}</div>
            <div className="text-white/40 text-[8px]">2m · Brooklyn</div>
          </div>
          <MoreHorizontal className="w-3.5 h-3.5 text-white/40" />
        </div>
        <div className="aspect-square relative overflow-hidden">
          <Img src={SCENES.rooftop} alt="Friends rooftop" className="absolute inset-0 w-full h-full" />
        </div>
        <div className="p-2">
          <div className="flex items-center gap-3 text-white/85">
            <Heart className="w-4 h-4 text-pink-400 fill-pink-400" />
            <MessageCircle className="w-4 h-4" />
            <Send className="w-4 h-4" />
            <Bookmark className="w-4 h-4 ml-auto" />
          </div>
          <div className="text-[10px] text-white/85 mt-1.5 leading-snug">
            <span className="font-semibold">{PEOPLE.maya.handle}</span>{' '}
            <span className="text-white/65">rooftop nights with the crew 🌃</span>
          </div>
          <div className="text-[8px] text-white/40 mt-0.5">View all 89 comments</div>
        </div>
      </div>
    </div>
    <PhoneBottomNav active="home" />
  </div>
);

// === FRIEND MAP — mirrors src/pages/FriendMap.tsx ===
const MapPhone = () => (
  <div className="w-full h-full bg-[#0B0B10] relative overflow-hidden">
    <StatusBar />
    <div className="absolute top-7 inset-x-0 px-3 h-10 flex items-center justify-between z-10">
      <div className="text-white font-bold text-[12px] flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-cyan-400" /> Friend Map</div>
      <div className="flex gap-1 items-center">
        <div className="text-[8px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">4 nearby</div>
        <div className="w-6 h-6 rounded-full bg-white/5 border border-white/10 flex items-center justify-center"><Globe className="w-3 h-3 text-white/70" /></div>
      </div>
    </div>
    <div className="absolute inset-0 top-[60px] bottom-12">
      <div className="absolute inset-0"
        style={{background:'radial-gradient(ellipse at 50% 40%, rgba(6,182,212,0.18), transparent 60%), linear-gradient(135deg, #0a1428, #0B0B10)'}} />
      <div className="absolute inset-0 opacity-25" style={{backgroundImage:'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)', backgroundSize:'22px 22px'}} />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="relative">
          <div className="absolute rounded-full bg-cyan-400/30 animate-ping" style={{width:48,height:48,left:-22,top:-22}} />
          <Img src={PEOPLE.maya.img} className="w-7 h-7 rounded-full border-2 border-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.7)]" />
        </div>
      </div>
      {[
        {t:'18%',l:'24%',p:PEOPLE.sky,e:'🌙'},
        {t:'58%',l:'72%',p:PEOPLE.leo,e:'☕'},
        {t:'72%',l:'18%',p:PEOPLE.mia,e:'🎧'},
        {t:'26%',l:'76%',p:PEOPLE.kai,e:'🏀'},
      ].map((p,i)=>(
        <div key={i} className="absolute -translate-x-1/2 -translate-y-full" style={{top:p.t,left:p.l}}>
          <div className="flex flex-col items-center">
            <div className="relative">
              <Img src={p.p.img} className="w-7 h-7 rounded-full border-2 border-white shadow-lg" />
              <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-[#0B0B10] border border-white/20 flex items-center justify-center text-[8px]">{p.e}</div>
            </div>
            <div className="mt-0.5 px-1 py-0.5 rounded text-[7px] bg-black/70 text-white whitespace-nowrap">{p.p.handle.slice(1)}</div>
          </div>
        </div>
      ))}
      <div className="absolute bottom-2 left-2 right-2 rounded-xl bg-[#15151c]/90 backdrop-blur-xl border border-white/10 p-2 flex items-center gap-2">
        <Img src={PEOPLE.leo.img} className="w-8 h-8 rounded-full" />
        <div className="flex-1">
          <div className="text-white text-[11px] font-semibold leading-tight">{PEOPLE.leo.name}</div>
          <div className="text-white/50 text-[8px]">0.4 mi · Sunny 72° · Café Mile</div>
        </div>
        <div className="px-2 py-1 rounded-full bg-gradient-to-r from-violet-500 to-cyan-500 text-white text-[8px] font-semibold">Bump</div>
      </div>
    </div>
    <PhoneBottomNav active="map" />
  </div>
);

// === CHAT — mirrors ChatView.tsx ===
const ChatPhone = () => (
  <div className="w-full h-full bg-[#0B0B10] relative overflow-hidden">
    <StatusBar />
    <div className="absolute top-7 inset-x-0 h-12 bg-[#0B0B10]/80 backdrop-blur-xl border-b border-white/5 px-3 flex items-center gap-2 z-10">
      <ArrowLeft className="w-4 h-4 text-white/70" />
      <div className="relative">
        <Img src={PEOPLE.jordan.img} className="w-7 h-7 rounded-full" />
        <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#0B0B10]" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-white text-[12px] font-semibold leading-tight">{PEOPLE.jordan.name}</div>
        <div className="text-white/50 text-[8px] flex items-center gap-1">
          <Flame className="w-2.5 h-2.5 text-amber-400" /> 14d streak · active now
        </div>
      </div>
      <Camera className="w-4 h-4 text-white/70" />
    </div>
    <div className="absolute inset-0 pt-[76px] pb-[60px] px-2.5 flex flex-col gap-1.5 justify-end overflow-hidden">
      <div className="self-center text-[8px] text-white/35 mb-1">Today</div>
      <div className="self-start max-w-[78%] bg-white/[0.07] rounded-2xl rounded-bl-md px-3 py-1.5 text-white text-[11px]">yo you up?</div>
      <div className="self-end max-w-[78%] rounded-2xl rounded-br-md px-3 py-1.5 text-white text-[11px]" style={{background:'linear-gradient(135deg, #8B5CF6, #06B6D4)'}}>always 🌙</div>
      <div className="self-start relative max-w-[78%] mb-1">
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
    <div className="absolute bottom-12 inset-x-0 px-2.5 pb-1.5 z-10">
      <div className="rounded-full bg-white/5 border border-white/10 px-3 h-8 flex items-center gap-2">
        <Plus className="w-3.5 h-3.5 text-white/50" />
        <div className="text-white/40 text-[10px] flex-1">Message…</div>
        <Smile className="w-3.5 h-3.5 text-white/50" />
        <Mic className="w-3.5 h-3.5 text-white/50" />
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
  { icon: Trophy, label: 'Battle Pass', desc: 'Level up daily' },
  { icon: Crown, label: 'VYBE Pro', desc: 'Coming soon', soon: true },
  { icon: ShieldCheck, label: 'Vybe Check', desc: 'Real-time safety AI' },
  { icon: Bell, label: 'Smart Notifs', desc: 'Quiet by default' },
];

const VybeHome = memo(function VybeHome() {
  const { data: liveUserCount, isLoading: countLoading } = usePublicUserCount();
  useEffect(() => {
    const prev = document.title;
    document.title = 'VYBE — The social app that becomes you';
    let meta = document.querySelector('meta[name="description"]');
    const prevDesc = meta?.getAttribute('content') ?? '';
    if (!meta) { meta = document.createElement('meta'); meta.setAttribute('name','description'); document.head.appendChild(meta); }
    meta.setAttribute('content', 'Evolving DNA, custom Aura, real friends nearby, ephemeral snaps, and creator tools — VYBE is the social app that becomes you.');
    return () => { document.title = prev; meta?.setAttribute('content', prevDesc); };
  }, []);
  return (
    <div className="page-scroll-fix bg-[#0B0B10] text-white">
      {/* SEO handled via useEffect below */}

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
                {[PEOPLE.maya, PEOPLE.jordan, PEOPLE.leo, PEOPLE.sky].map(p => (
                  <Img key={p.handle} src={p.img} className="w-6 h-6 rounded-full border-2 border-[#0B0B10]" />
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
              <div className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-400" /> Free forever</div>
              <div className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-400" /> No ads in DMs</div>
              <div className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-400" /> AI-powered safety</div>
            </div>
          </FadeIn>

          {/* Hero phones */}
          <FadeIn delay={0.1}>
            <div className="relative h-[560px] hidden lg:block">
              <motion.div animate={{y:[0,-12,0]}} transition={{duration:6,repeat:Infinity,ease:'easeInOut'}}
                className="absolute left-0 top-10 z-10">
                <PhoneFrame tilt={-6}><FeedPhone /></PhoneFrame>
              </motion.div>
              <motion.div animate={{y:[0,12,0]}} transition={{duration:7,repeat:Infinity,ease:'easeInOut',delay:0.5}}
                className="absolute right-0 top-0 z-20">
                <PhoneFrame tilt={6}><DNAPhone /></PhoneFrame>
              </motion.div>
              <motion.div animate={{y:[0,-8,0]}} transition={{duration:8,repeat:Infinity,ease:'easeInOut',delay:1}}
                className="absolute left-1/2 -translate-x-1/2 bottom-0 z-30">
                <PhoneFrame tilt={2}><ChatPhone /></PhoneFrame>
              </motion.div>
            </div>
            <div className="lg:hidden flex justify-center">
              <PhoneFrame><DNAPhone /></PhoneFrame>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* SOCIAL PROOF STRIP */}
      <section className="py-10 px-6 border-y border-white/5 bg-white/[0.02]">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {[
            {n:'120+', l:'Features in one app'},
            {n:'∞', l:'Theme combinations'},
            {n:'<200ms', l:'Message delivery'},
            {n:'24/7', l:'AI safety scanning'},
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
            phone={<DNAPhone />}
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
            phone={<FeedPhone />}
          />
        </FadeIn>
      </SectionWrap>

      <SectionWrap>
        <FadeIn>
          <FeatureRow
            tag="Friend Map · Bump · NFC"
            title="Built for your real friends, IRL."
            desc="See where your people are right now (Ghost Mode anytime). Bump phones to add. Tap NFC to swap. The first social app that respects the physical world."
            bullets={['Live friend map with weather','Bump-to-add via swing detection','One-tap NFC pairing']}
            phone={<MapPhone />}
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
            bullets={['<1s call connect time','48-hour reaction streaks','End-to-end encrypted messages']}
            phone={<ChatPhone />}
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
              <tr className="text-white/40 text-xs uppercase tracking-wider">
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
                ['Live friend map + bump', false, false, false],
                ['Customizable everything', false, false, false],
                ['Disappearing snaps', false, true, false],
                ['Communities & spaces', false, false, true],
                ['Creator payouts (60-70%)', true, false, false],
                ['Built-in AI assistant', false, false, false],
              ].map((row, i) => (
                <tr key={i} className="border-t border-white/5">
                  <td className="text-left p-4 font-medium">{row[0]}</td>
                  {row.slice(1).map((v, j) => (
                    <td key={j} className="p-4 text-center">
                      {v ? <Check className="w-4 h-4 text-white/40 inline" /> : <X className="w-4 h-4 text-white/15 inline" />}
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

      {/* TESTIMONIALS */}
      <SectionWrap>
        <FadeIn>
          <div className="text-center mb-12">
            <div className="text-xs uppercase tracking-widest text-violet-400 mb-3 font-semibold">Real people</div>
            <h2 className="font-display font-black text-4xl sm:text-5xl">Built for actual humans.</h2>
          </div>
        </FadeIn>
        <div className="grid md:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {[
            { p: PEOPLE.maya, loc: 'Brooklyn, NY', q: 'My DNA card actually shifts every week — I\'ve never seen an app that gets me this fast.' },
            { p: PEOPLE.jordan, loc: 'Austin, TX', q: 'Bumping phones to add friends is the most fun I\'ve had on a social app in years. My group went all-in in a week.' },
            { p: PEOPLE.ren, loc: 'Los Angeles, CA', q: 'Themes I made for friends went viral inside our circle. Feels like MySpace energy but actually polished.' },
          ].map((t, i) => (
            <FadeIn key={t.p.handle} delay={i * 0.08}>
              <div className="h-full p-6 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-violet-400/30 transition">
                <p className="text-white/85 text-[15px] leading-relaxed">"{t.q}"</p>
                <div className="mt-5 flex items-center gap-3">
                  <Img src={t.p.img} className="w-10 h-10 rounded-full" />
                  <div>
                    <div className="text-white text-sm font-semibold">{t.p.name}</div>
                    <div className="text-white/50 text-xs">{t.p.handle} · {t.loc}</div>
                  </div>
                </div>
              </div>
            </FadeIn>
          ))}
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
            <span className="text-white/30">© 2026</span>
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
      <div className="flex justify-center">{phone && <PhoneFrame>{phone}</PhoneFrame>}</div>
    </div>
  );
}

export default VybeHome;
