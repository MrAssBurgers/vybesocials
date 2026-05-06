import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Sparkles, Layers, Crown, Users, Zap, Heart, Radio, MapPin, Target, Home as HomeIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import welcomeHome from '@/assets/welcome-home.png';
import welcomeFriendLink from '@/assets/welcome-friendlink.png';
import welcomeMap from '@/assets/welcome-map.png';
import welcomeChallenges from '@/assets/welcome-challenges.png';

const SHOWCASE = [
  {
    icon: HomeIcon,
    image: welcomeHome,
    title: 'Your home, your VYBE',
    body: 'A home screen that adapts to you — Daily Brief, DNA, Wallet, and the people you care about, one tap away.',
    accent: 'from-primary/30 to-accent/20',
  },
  {
    icon: Radio,
    image: welcomeFriendLink,
    title: 'Friend Link — tap to connect',
    body: 'Hold phones together and add friends instantly. No usernames, no QR hunting — just a tap.',
    accent: 'from-pink-500/30 to-cyan-400/20',
  },
  {
    icon: MapPin,
    image: welcomeMap,
    title: 'See your people on the map',
    body: 'Friends, weather, trending spots, and Ghost Mode when you want privacy. Your world, live.',
    accent: 'from-blue-500/30 to-cyan-400/20',
  },
  {
    icon: Target,
    image: welcomeChallenges,
    title: 'Challenges, XP & levels',
    body: 'Daily, weekly, and permanent challenges. Earn badges, level up, and climb the ranks.',
    accent: 'from-pink-500/30 to-primary/20',
  },
];

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const },
};

const PILLARS = [
  {
    icon: Heart,
    title: 'Real connection',
    body: 'Built for the people you actually care about — not strangers fighting for attention.',
  },
  {
    icon: Sparkles,
    title: 'Your VYBE, your space',
    body: 'Themes, layouts, sounds, and an AI that learns you. Every profile feels alive.',
  },
  {
    icon: Users,
    title: 'Communities that move',
    body: 'Drop into spaces, join calls, share moments — discover your people without the noise.',
  },
];

const ROADMAP = [
  {
    icon: Layers,
    tag: 'Coming soon',
    title: 'Mini Apps',
    body: 'Tiny tools and games that live inside VYBE — playable in a tap, shareable in a swipe.',
  },
  {
    icon: Crown,
    tag: 'In the works',
    title: 'VYBE+',
    body: 'A premium tier with exclusive themes, AI boosts, creator perks, and early access drops.',
  },
  {
    icon: Zap,
    tag: 'Always evolving',
    title: 'Your DNA, smarter',
    body: 'An autonomous AI agent that reshapes your feed, theme, and layout to fit your real vibe.',
  },
];

export default function AppWelcome() {
  const navigate = useNavigate();

  return (
    <div className="page-scroll-fix min-h-[100dvh] bg-background text-foreground overflow-y-auto pb-24">
      {/* Ambient gradient */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute top-0 left-1/4 h-[480px] w-[480px] rounded-full bg-primary/20 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[420px] w-[420px] rounded-full bg-accent/15 blur-[120px]" />
      </div>

      <div className="mx-auto w-full max-w-2xl px-5 pt-16 sm:pt-24">
        {/* Hero */}
        <motion.div {...fadeUp}>
          <div className="inline-flex items-center gap-2 rounded-full border border-border/40 bg-card/60 backdrop-blur-xl px-3 py-1 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Welcome to VYBE
          </div>
          <h1 className="mt-5 text-4xl sm:text-5xl font-bold leading-[1.05] tracking-tight">
            A social home that
            <span className="block bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
              actually feels like you.
            </span>
          </h1>
          <p className="mt-4 text-base sm:text-lg text-muted-foreground leading-relaxed">
            VYBE is where your friends, your creativity, and your identity live in one place — quiet when you want it, alive when you don't.
          </p>
        </motion.div>

        {/* Vision pillars */}
        <motion.div
          {...fadeUp}
          transition={{ ...fadeUp.transition, delay: 0.1 }}
          className="mt-12 space-y-3"
        >
          <h2 className="text-xs uppercase tracking-[0.18em] text-muted-foreground/80">Our vision</h2>
          {PILLARS.map((p, i) => (
            <motion.div
              key={p.title}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.15 + i * 0.05 }}
              className="rounded-2xl border border-border/40 bg-card/60 backdrop-blur-xl p-4 sm:p-5"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <p.icon className="h-4.5 w-4.5" strokeWidth={2} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-semibold">{p.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{p.body}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Roadmap */}
        <motion.div
          {...fadeUp}
          transition={{ ...fadeUp.transition, delay: 0.2 }}
          className="mt-12 space-y-3"
        >
          <h2 className="text-xs uppercase tracking-[0.18em] text-muted-foreground/80">What's next</h2>
          {ROADMAP.map((r, i) => (
            <motion.div
              key={r.title}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.25 + i * 0.05 }}
              className="relative overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/5 via-card/60 to-accent/5 backdrop-blur-xl p-4 sm:p-5"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 text-primary">
                  <r.icon className="h-4.5 w-4.5" strokeWidth={2} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold">{r.title}</h3>
                    <span className="text-[10px] uppercase tracking-wider text-primary/80 bg-primary/10 px-1.5 py-0.5 rounded-md">
                      {r.tag}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{r.body}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Promise */}
        <motion.p
          {...fadeUp}
          transition={{ ...fadeUp.transition, delay: 0.35 }}
          className="mt-10 text-center text-sm text-muted-foreground italic"
        >
          We're building VYBE in the open, with you. Every update is shaped by what you tell us.
        </motion.p>

        {/* CTA */}
        <motion.div
          {...fadeUp}
          transition={{ ...fadeUp.transition, delay: 0.4 }}
          className="mt-8 flex flex-col gap-3"
        >
          <Button
            size="lg"
            onClick={() => navigate('/home')}
            className="h-12 rounded-2xl bg-gradient-to-r from-primary to-accent text-primary-foreground font-semibold shadow-[0_8px_30px_-8px_hsl(var(--primary)/0.6)]"
          >
            Enter VYBE
            <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            onClick={() => navigate('/feature-voting')}
            className="h-11 rounded-2xl text-muted-foreground"
          >
            Shape what we build next →
          </Button>
        </motion.div>
      </div>
    </div>
  );
}
