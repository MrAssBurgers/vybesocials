import { Link } from 'react-router-dom';
import { VYBELogo } from '@/components/ui/VYBELogo';
import { MessageCircle, Video, Users, Sparkles, Shield, Zap, Camera, Music, Globe, Heart } from 'lucide-react';
import { usePageMeta } from '@/hooks/usePageMeta';

const features = [
  {
    icon: Camera,
    title: 'Stories & Snaps',
    description: 'Share ephemeral moments with friends through stories that disappear in 24 hours. Add filters, stickers, and AR effects to make every snap unique.',
  },
  {
    icon: Video,
    title: 'Clips & Short Videos',
    description: 'Create and discover short-form video content with trending sounds, effects, and a personalized feed powered by your interests.',
  },
  {
    icon: MessageCircle,
    title: 'Real-Time Messaging',
    description: 'Stay connected with encrypted direct messages, group chats, voice and video calls, and expressive reactions that bring conversations to life.',
  },
  {
    icon: Users,
    title: 'Communities & Servers',
    description: 'Join or create community spaces around shared interests. Organize discussions in channels, host events, and build your tribe.',
  },
  {
    icon: Music,
    title: 'Music & Sounds',
    description: 'Discover trending audio, share your music taste through VYBE DNA, and add the perfect soundtrack to your content.',
  },
  {
    icon: Sparkles,
    title: 'AI-Powered Features',
    description: 'Get personalized content recommendations, AI-assisted content creation, smart search, and an AI companion that understands your vibe.',
  },
  {
    icon: Globe,
    title: 'Friend Map',
    description: 'See where your friends are vibing on an interactive map. Share your location with trusted connections and discover nearby events.',
  },
  {
    icon: Shield,
    title: 'Safety First',
    description: 'Advanced content moderation, customizable privacy controls, and community guidelines enforcement keep VYBE a positive space for everyone.',
  },
  {
    icon: Zap,
    title: 'Creator Tools',
    description: 'Monetize your content, track analytics, build your brand, and connect with your audience through creator-focused features.',
  },
  {
    icon: Heart,
    title: 'Engagement & Rewards',
    description: 'Earn XP, unlock badges, complete challenges, and climb leaderboards. Your activity is recognized and rewarded on VYBE.',
  },
];

export default function About() {
  usePageMeta({
    title: 'About VYBE — The Next Generation Social Platform',
    description: 'Learn about VYBE: who we are, what we build, and why we believe a more human social app is possible. Stories, clips, encrypted DMs, communities, and AI that actually knows you.',
    canonicalPath: '/about',
  });
  return (
    <div className="page-scroll-fix bg-background">
      {/* Header */}
      <header className="border-b border-border/50 sticky top-0 z-50 bg-background/80 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <VYBELogo size="sm" showText={false} />
            <span className="font-display font-bold text-lg text-foreground">VYBE</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link to="/about" className="text-foreground font-medium">About</Link>
            <Link to="/contact" className="hover:text-foreground transition-colors">Contact</Link>
            <Link to="/" className="text-primary font-medium hover:underline">Sign In</Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="py-16 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-display font-bold text-foreground mb-4">
            About VYBE
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto">
            VYBE is a next-generation social platform that combines the best of messaging, stories, short-form video, communities, and creator tools into one seamless experience. We believe in authentic connection, creative expression, and building communities that matter.
          </p>
        </div>
      </section>

      {/* Mission */}
      <section className="py-12 px-4 border-t border-border/30">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-display font-bold text-foreground mb-4 text-center">Our Mission</h2>
          <p className="text-muted-foreground leading-relaxed text-center">
            We're building a social platform where creativity thrives, communities flourish, and every user feels safe to express themselves. VYBE puts people first — not algorithms, not advertisers, not engagement metrics. Our goal is to create meaningful connections and empower creators to share their authentic selves with the world.
          </p>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-12 px-4 border-t border-border/30">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-display font-bold text-foreground mb-8 text-center">Platform Features</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <div key={feature.title} className="rounded-xl border border-border/50 p-5 bg-card/50">
                <feature.icon className="w-8 h-8 text-primary mb-3" />
                <h3 className="font-semibold text-foreground mb-1.5">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-12 px-4 border-t border-border/30">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-display font-bold text-foreground mb-6 text-center">How VYBE Works</h2>
          <div className="space-y-6">
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">1</div>
              <div>
                <h3 className="font-semibold text-foreground">Create Your Profile</h3>
                <p className="text-sm text-muted-foreground mt-1">Sign up, choose your username, and customize your profile with a unique bento grid layout, VYBE DNA music identity, and personalized theme.</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">2</div>
              <div>
                <h3 className="font-semibold text-foreground">Connect & Discover</h3>
                <p className="text-sm text-muted-foreground mt-1">Find friends through Quick Add, QR codes, NFC sharing, or mutual connections. Discover trending content, communities, and creators on the Explore page.</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">3</div>
              <div>
                <h3 className="font-semibold text-foreground">Share & Create</h3>
                <p className="text-sm text-muted-foreground mt-1">Post photos, stories, clips, and text updates. Use the built-in camera with AR filters, add music, collaborate with other creators, and engage with your audience.</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">4</div>
              <div>
                <h3 className="font-semibold text-foreground">Grow & Earn</h3>
                <p className="text-sm text-muted-foreground mt-1">Level up through engagement, earn badges and rewards, join the creator program, and monetize your content through the VYBE marketplace and business tools.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 py-8 px-4 mt-8">
        <div className="max-w-5xl mx-auto flex flex-col items-center gap-4">
          <div className="flex flex-wrap justify-center gap-4 text-sm text-muted-foreground">
            <Link to="/about" className="hover:text-foreground transition-colors">About</Link>
            <Link to="/contact" className="hover:text-foreground transition-colors">Contact</Link>
            <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-foreground transition-colors">Terms of Use</Link>
            <Link to="/guidelines" className="hover:text-foreground transition-colors">Community Guidelines</Link>
            <Link to="/cookies" className="hover:text-foreground transition-colors">Cookie Policy</Link>
          </div>
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Vybe Studios. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
