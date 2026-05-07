import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PublicFooter } from '@/components/marketing/PublicFooter';
import { CITIES } from '@/content/cities';

export default function LocalIndex() {
  const navigate = useNavigate();

  useEffect(() => {
    const prevTitle = document.title;
    const desc = document.querySelector('meta[name="description"]');
    const prevDesc = desc?.getAttribute('content') ?? null;
    const canonical = document.querySelector('link[rel="canonical"]');
    const prevCanon = canonical?.getAttribute('href') ?? null;

    document.title = 'VYBE Local — Creators, clips & communities near you';
    desc?.setAttribute(
      'content',
      'Discover local VYBE creators, clips, and communities in cities around the world. Join the city near you and start vibing.',
    );
    canonical?.setAttribute('href', 'https://vybehub.app/local');

    return () => {
      document.title = prevTitle;
      if (prevDesc) desc?.setAttribute('content', prevDesc);
      if (prevCanon) canonical?.setAttribute('href', prevCanon);
    };
  }, []);

  return (
    <div className="page-scroll-fix bg-background">
      <div className="max-w-5xl mx-auto p-4 sm:p-6">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>

        <motion.header initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
          <h1 className="text-4xl sm:text-5xl font-bold mb-4 bg-gradient-to-r from-primary via-purple-400 to-cyan-400 bg-clip-text text-transparent">
            VYBE Local
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl">
            Find creators, clips, and communities in your city. VYBE's local feed surfaces what's vibing within a 25-mile radius — pick a city to explore.
          </p>
        </motion.header>

        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-10">
          {CITIES.map((c) => (
            <Link key={c.slug} to={`/local/${c.slug}`} className="rounded-2xl border border-border bg-card p-4 hover:border-primary/40 transition-colors">
              <MapPin className="w-4 h-4 text-primary mb-2" />
              <div className="font-semibold text-foreground">{c.name}</div>
              <div className="text-xs text-muted-foreground">{c.country}</div>
            </Link>
          ))}
        </section>

        <PublicFooter />
      </div>
    </div>
  );
}
