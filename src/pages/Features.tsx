import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Sparkles, Map as MapIcon, Shield, Music, Users, Zap, Heart, MessageCircle, Camera, Trophy, Bot, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PublicFooter } from '@/components/marketing/PublicFooter';
import { useAppScreenshots } from '@/hooks/useAppScreenshots';
import { usePageMeta } from '@/hooks/usePageMeta';

const features = [
  { icon: Bot, title: 'VYBE AI Assistant', body: 'A real-time, multi-modal AI built into the app. Ask it anything, generate images, get personalized recommendations, or have it summarize your day. Powered by Gemini and GPT-5 through a unified gateway, with auto-switching for cost and speed.' },
  { icon: Sparkles, title: 'VYBE DNA — your living personality', body: 'Every reaction, comment, save, and watch shapes a 30-day rolling vector that evolves how the feed ranks content for you. Your DNA visualizes the tags, moods, and creators you actually care about — not what an ad network thinks you do.' },
  { icon: MapIcon, title: 'Friend Map with Ghost Mode', body: 'See where your friends are vibing in real time. Built-in Ghost Mode lets you go invisible at any moment with one tap. Includes weather overlays so you can plan a hangout based on whether it is sunny on their side of town.' },
  { icon: Camera, title: 'Stories, Clips, and VYBE Snaps', body: 'Vertical 9:16 capture with screen flash, pinch-to-zoom, tap-to-text, on-device filters, AI stickers, and music sync. Share permanent posts, 24-hour stories, ephemeral snaps, or live VYBE Spaces — all from one composer.' },
  { icon: MessageCircle, title: 'Encrypted DMs and group chats', body: 'AES-256 at rest, plaintext on your device. Reactions, swipe-to-reply, voice notes, video calls, GIFs, group admin tools, @mentions, and Discord-style multi-emoji reactions. Notes (ephemeral GIF status updates) live above your inbox.' },
  { icon: Music, title: 'Music and sound trends', body: 'Browse trending sounds, attach them to clips, take the music personality quiz, and discover creators on the same wavelength. Explicit tracks are gated for users under 13.' },
  { icon: Trophy, title: 'XP, badges, levels, and streaks', body: 'Every meaningful action earns XP. Climb 100 levels, unlock badges in your Locker, run 48-hour reaction streaks, and compete on weekly leaderboards. Gamified — but in a way that rewards actually being kind and consistent.' },
  { icon: Users, title: 'Communities and Spaces', body: 'Public or private communities with their own feeds, events, and moderators. Live audio Spaces let you host real-time conversations with up to hundreds of listeners.' },
  { icon: Heart, title: 'Multi-reaction system', body: 'Pick from a wide palette of emoji reactions instead of a single like. Long-press any post or message to react with multiple emojis at once. Reactions count toward your DNA and the creator\'s engagement score.' },
  { icon: Shield, title: 'Vybe Check safety scanning', body: 'Every uploaded photo, video, and audio file is scanned by Gemini Flash + SafeSearch before it goes live. Explicit content is blocked, AI-generated media is auto-watermarked, and users get a clear progress UI showing exactly what is being checked.' },
  { icon: Zap, title: 'Real-time everything', body: 'Posts, reactions, presence, typing indicators, calls, location, and notifications stay in sync as they happen. No refreshing required.' },
  { icon: Globe, title: 'Built-in commerce', body: 'Tip creators, sell digital and physical goods, accept payouts via Stripe Connect, run sponsored posts, and subscribe to VYBE Pro for premium customization, AI safety bypass on your own profile, and gifted entitlements.' },
];

export default function FeaturesPage() {
  const navigate = useNavigate();
  const { shots } = useAppScreenshots('features');

  usePageMeta({
    title: 'Features | VYBE — The Social App That Actually Knows You',
    description: 'Explore VYBE features: VYBE DNA personality engine, Friend Map, encrypted DMs, AI assistant, communities, music trends, XP and badges, and more.',
    canonicalPath: '/features',
  });

  return (
    <div className="page-scroll-fix bg-background">
      <div className="max-w-5xl mx-auto p-4 sm:p-6">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>

        <motion.header initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
          <h1 className="text-4xl sm:text-5xl font-bold mb-4 bg-gradient-to-r from-primary via-purple-400 to-cyan-400 bg-clip-text text-transparent">
            Everything VYBE can do
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl">
            VYBE is a next-generation social app built around your personality, not your engagement metrics. Here is the full feature set.
          </p>
        </motion.header>

        <section className="grid sm:grid-cols-2 gap-4 mb-12">
          {features.map((f, i) => (
            <motion.article
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="rounded-2xl border border-border bg-card p-5 hover:border-primary/40 transition-colors"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-cyan-400/20 flex items-center justify-center">
                  <f.icon className="w-5 h-5 text-primary" />
                </div>
                <h2 className="font-semibold text-foreground">{f.title}</h2>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.body}</p>
            </motion.article>
          ))}
        </section>

        {shots.length > 0 && (
          <section className="mb-12">
            <div className="mb-6">
              <h2 className="text-2xl sm:text-3xl font-bold mb-2">See it in action</h2>
              <p className="text-muted-foreground">Real screens, straight from the app.</p>
            </div>
            <div className="relative -mx-4 sm:mx-0">
              <div className="flex gap-5 overflow-x-auto px-4 sm:px-0 pb-6 snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {shots.map((s, i) => (
                  <motion.figure
                    key={s.id}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-50px' }}
                    transition={{ delay: Math.min(i * 0.04, 0.3) }}
                    className="snap-center shrink-0 w-[240px] sm:w-[280px]"
                  >
                    <div className="rounded-[2rem] overflow-hidden bg-gradient-to-br from-primary/10 via-card to-cyan-400/10 p-1">
                      <img
                        src={s.device_url || s.raw_url || ''}
                        alt={s.title}
                        loading="lazy"
                        className="w-full h-auto block"
                      />
                    </div>
                    <figcaption className="mt-3 px-1">
                      <div className="text-sm font-semibold text-foreground">{s.title}</div>
                      {s.subtitle && (
                        <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{s.subtitle}</div>
                      )}
                    </figcaption>
                  </motion.figure>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-border bg-card p-6 mb-10 text-center">
          <h2 className="text-2xl font-bold mb-2">Ready to find your tribe?</h2>
          <p className="text-muted-foreground mb-4">Join the founders shaping VYBE before public launch.</p>
          <Button asChild size="lg">
            <Link to="/?signup=true">Create your free account</Link>
          </Button>
        </section>

        <PublicFooter />
      </div>
    </div>
  );
}
