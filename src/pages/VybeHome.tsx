import { memo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Dna, Sparkles, MapPin, MessageCircle, Radio, ShoppingBag, Wallet, Bot,
  Palette, Flame, Shuffle, Trophy, Camera, ShieldCheck, Heart, Users,
  Zap, Crown, Bell, PlayCircle, ArrowRight, Check, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

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

/* ---------- Phone mockups (stylized in-browser) ---------- */

const DNAPhone = () => (
  <div className="w-full h-full bg-gradient-to-br from-[#0B0B10] via-[#1a0d2e] to-[#0B0B10] p-4 pt-8 flex flex-col gap-3">
    <div className="text-[10px] uppercase tracking-widest text-violet-300/70 font-semibold">Your VYBE DNA</div>
    <div className="text-white text-lg font-bold leading-tight">The Night Owl ✦ Creator</div>
    <div className="relative aspect-square w-full mt-2 rounded-2xl bg-gradient-to-br from-violet-500/30 to-cyan-400/20 border border-white/10 overflow-hidden flex items-center justify-center">
      <div className="absolute inset-0">
        {[...Array(40)].map((_, i) => (
          <div key={i} className="absolute rounded-full bg-violet-300/40" style={{
            top: `${Math.random()*100}%`, left: `${Math.random()*100}%`,
            width: 2+Math.random()*3, height: 2+Math.random()*3,
          }} />
        ))}
      </div>
      <Dna className="w-20 h-20 text-violet-200 relative z-10 drop-shadow-[0_0_20px_rgba(139,92,246,0.7)]" />
    </div>
    <div className="grid grid-cols-3 gap-2 mt-1">
      {['Curious','Bold','Chill'].map(t => (
        <div key={t} className="text-center text-[10px] py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/80">{t}</div>
      ))}
    </div>
    <div className="mt-auto text-[10px] text-white/40 text-center">Evolves every 30 days</div>
  </div>
);

const FeedPhone = () => (
  <div className="w-full h-full bg-[#0B0B10] p-3 pt-8 flex flex-col gap-2.5">
    <div className="flex items-center justify-between px-1">
      <div className="text-white font-bold text-base">VYBE</div>
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-cyan-400" />
    </div>
    <div className="flex gap-2 overflow-hidden">
      {['#8B5CF6','#06B6D4','#EC4899','#F59E0B','#10B981'].map((c,i)=>(
        <div key={i} className="w-12 h-12 shrink-0 rounded-full p-0.5" style={{background:`linear-gradient(135deg, ${c}, transparent)`}}>
          <div className="w-full h-full rounded-full bg-[#1a1a22]" />
        </div>
      ))}
    </div>
    <div className="rounded-2xl overflow-hidden bg-gradient-to-br from-violet-600/30 to-cyan-500/20 border border-white/10 flex-1">
      <div className="aspect-square bg-gradient-to-br from-fuchsia-500/40 via-violet-500/30 to-cyan-400/30 relative">
        <div className="absolute bottom-2 left-2 text-white text-xs font-medium">@maya · 2m</div>
      </div>
      <div className="p-2 flex gap-2 text-white/80 text-xs">
        <Heart className="w-4 h-4" /><span>1.2k</span>
        <MessageCircle className="w-4 h-4 ml-2" /><span>89</span>
      </div>
    </div>
  </div>
);

const MapPhone = () => (
  <div className="w-full h-full bg-[#0B0B10] p-3 pt-8 flex flex-col gap-2 relative">
    <div className="text-white font-bold text-base px-1">Friends Near You</div>
    <div className="flex-1 rounded-2xl bg-gradient-to-br from-cyan-500/20 via-[#0B0B10] to-violet-500/20 border border-white/10 relative overflow-hidden">
      {[
        {t:'20%',l:'30%',c:'#8B5CF6'},
        {t:'55%',l:'60%',c:'#06B6D4'},
        {t:'70%',l:'25%',c:'#EC4899'},
        {t:'35%',l:'70%',c:'#F59E0B'},
      ].map((p,i)=>(
        <div key={i} className="absolute -translate-x-1/2 -translate-y-1/2" style={{top:p.t,left:p.l}}>
          <div className="w-8 h-8 rounded-full border-2 border-white shadow-lg animate-pulse" style={{background:p.c}} />
        </div>
      ))}
      <div className="absolute inset-0" style={{
        backgroundImage: 'radial-gradient(circle at 50% 50%, transparent 30%, rgba(0,0,0,0.4) 100%)',
      }} />
    </div>
    <div className="rounded-xl bg-white/5 border border-white/10 p-2 text-white/80 text-[11px]">
      <div className="flex items-center gap-1.5"><MapPin className="w-3 h-3 text-cyan-400"/>4 friends within 2 miles</div>
    </div>
  </div>
);

const ChatPhone = () => (
  <div className="w-full h-full bg-[#0B0B10] p-3 pt-8 flex flex-col gap-2">
    <div className="flex items-center gap-2 pb-2 border-b border-white/5">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 to-violet-500" />
      <div>
        <div className="text-white text-sm font-semibold">@jordan</div>
        <div className="text-emerald-400 text-[10px] flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> active now
        </div>
      </div>
    </div>
    <div className="flex-1 flex flex-col gap-2 justify-end">
      <div className="self-start max-w-[75%] bg-white/10 rounded-2xl rounded-bl-sm px-3 py-2 text-white text-xs">yo you up?</div>
      <div className="self-end max-w-[75%] bg-gradient-to-br from-violet-500 to-cyan-500 rounded-2xl rounded-br-sm px-3 py-2 text-white text-xs">always 🌙</div>
      <div className="self-start max-w-[75%] bg-white/10 rounded-2xl rounded-bl-sm px-3 py-2 text-white text-xs">vibe check?</div>
      <div className="self-end flex items-center gap-1">
        <div className="text-[10px] text-white/40">typing...</div>
      </div>
    </div>
    <div className="rounded-full bg-white/5 border border-white/10 px-3 py-2 text-white/40 text-xs">Message...</div>
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
  { icon: Crown, label: 'VYBE Pro', desc: 'Unlock everything' },
  { icon: ShieldCheck, label: 'Vybe Check', desc: 'Real-time safety AI' },
  { icon: Bell, label: 'Smart Notifs', desc: 'Quiet by default' },
];

const VybeHome = memo(function VybeHome() {
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
    <div className="min-h-screen bg-[#0B0B10] text-white overflow-x-hidden">
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
            <Link to="/" className="hidden sm:block px-4 py-2 text-sm text-white/80 hover:text-white transition">Sign in</Link>
            <Link to="/" className="px-4 py-2 rounded-full text-sm font-semibold bg-white text-[#0B0B10] hover:scale-105 transition">
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
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-white/70 mb-6">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Now in early access
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
              <Link to="/" className="px-6 py-3.5 rounded-full bg-gradient-to-r from-violet-500 to-cyan-500 text-white font-semibold flex items-center gap-2 hover:scale-105 transition shadow-lg shadow-violet-500/30">
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
              <div className="group h-full p-5 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-violet-400/40 hover:bg-white/[0.06] transition-all hover:-translate-y-1">
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
                <Link to="/" className="px-8 py-4 rounded-full bg-white text-[#0B0B10] font-bold hover:scale-105 transition flex items-center gap-2">
                  Create your VYBE <ArrowRight className="w-4 h-4" />
                </Link>
                <Link to="/" className="px-8 py-4 rounded-full bg-white/10 border border-white/20 text-white font-semibold hover:bg-white/20 transition">
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
