import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Sparkles, Map as MapIcon, Shield, Users, Heart, MessageCircle, Camera, Trophy, Palette, Code2, Gamepad2, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PublicFooter } from '@/components/marketing/PublicFooter';
import { useAppScreenshots } from '@/hooks/useAppScreenshots';
import { usePageMeta } from '@/hooks/usePageMeta';

const features = [
  { icon: Palette, title: 'A profile that feels like yours', body: 'Choose colors, backgrounds, and profile effects. Save a theme or share your look with friends, then change it when you feel like something new.' },
  { icon: Sparkles, title: 'VYBE DNA', body: 'Explore an activity-inspired visual identity on your profile, with colors, patterns, and interests. Your profile brings your DNA and the things you share together.' },
  { icon: MapIcon, title: 'Friend Map with Ghost Mode', body: 'Explore the Friend Map and choose whether to share your location. Ghost Mode gives you a way to turn sharing off; location features depend on your device permissions.' },
  { icon: Camera, title: 'Posts, stories, clips, and snaps', body: 'Share photos and videos in a post, add a story, or send a snap to a friend. The camera includes filters and text tools so you can put your own spin on a moment.' },
  { icon: MessageCircle, title: 'Direct and group chats', body: 'Keep a conversation going with replies, reactions, GIFs, and voice or video calls. Conversation membership controls access to messages; VYBE DMs are not end-to-end encrypted.' },
  { icon: SlidersHorizontal, title: 'Motion and sound, your way', body: 'Choose a livelier or calmer feel, use reduced motion, and turn optional interface sounds on or off. Your experience settings let you decide how much animation and feedback you want.' },
  { icon: Trophy, title: 'Challenges and profile rewards', body: 'Complete eligible challenges and claim verified XP rewards. Explore levels, badges, and profile items in your Locker; each reward has its own requirements.' },
  { icon: Users, title: 'Communities and channels', body: 'Create a public community or a private one joined by invitation. Organize text and voice channels, appoint moderators, and manage channel permissions.' },
  { icon: Heart, title: 'More ways to react', body: 'Respond to posts and messages with emoji reactions, add a reply, or share something with a friend. Small interactions help make a conversation feel personal.' },
  { icon: Shield, title: 'Privacy and reporting controls', body: 'Choose your profile privacy, block unwanted contact, and report content or accounts. Community owners and moderators can manage their own spaces.' },
  { icon: Code2, title: 'Mini App Studio', body: 'Start with a game, tool, or art template. Edit HTML, CSS, and JavaScript, test a preview, save a private draft, and publish a version to the Hub. Sign in to build and publish.', href: '/mini-apps', linkLabel: 'Open Mini App Studio' },
  { icon: Gamepad2, title: 'Game SDK · developer preview', body: 'Integrate screenshots and short clips from your game. Players approve a connection, receive a private draft, and decide when to post. The partner preview requires a reviewed registration and deployed capture services.', href: '/developers#game-capture', linkLabel: 'Explore the Game SDK' },
];

export default function FeaturesPage() {
  const navigate = useNavigate();
  const { shots } = useAppScreenshots('features');

  usePageMeta({
    title: 'Features | VYBE',
    description: 'Explore VYBE posts, clips, conversations, communities, profile customization, Mini App Studio, and the game SDK developer preview.',
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
            Find your kind of VYBE
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl">
            Share a moment, gather your people, or build something of your own. Explore the social and creative tools in VYBE.
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
              {f.href && <Link to={f.href} className="mt-3 inline-flex min-h-11 items-center font-medium text-sm text-primary hover:underline">{f.linkLabel} →</Link>}
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

        <section className="rounded-2xl border border-border bg-card p-6 mb-6" aria-labelledby="feature-availability">
          <h2 id="feature-availability" className="text-xl font-semibold mb-2">A note on earning and paid features</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">Cash tips, creator payouts, paid subscriptions, and rewarded ads are not currently available. In-app tokens are for supported profile items, not cash payouts. The Game SDK is a developer preview; its setup requirements are in the <Link to="/developers" className="text-primary hover:underline">developer guide</Link>.</p>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 mb-10 text-center">
          <h2 className="text-2xl font-bold mb-2">Ready to find your tribe?</h2>
          <p className="text-muted-foreground mb-4">Create your profile and start exploring.</p>
          <Button asChild size="lg">
            <Link to="/?signup=true">Create your free account</Link>
          </Button>
        </section>

        <PublicFooter />
      </div>
    </div>
  );
}
