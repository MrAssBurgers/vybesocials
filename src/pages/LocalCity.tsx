import { useEffect } from 'react';
import { Link, useParams, Navigate, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, MapPin, Users, Sparkles, Map as MapIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PublicFooter } from '@/components/marketing/PublicFooter';
import { CITIES, getCity } from '@/content/cities';

export default function LocalCityPage() {
  const { city: slug } = useParams<{ city: string }>();
  const navigate = useNavigate();
  const city = slug ? getCity(slug) : undefined;

  useEffect(() => {
    if (!city) return;
    const prevTitle = document.title;
    const desc = document.querySelector('meta[name="description"]');
    const prevDesc = desc?.getAttribute('content') ?? null;
    const canonical = document.querySelector('link[rel="canonical"]');
    const prevCanon = canonical?.getAttribute('href') ?? null;

    document.title = `VYBE in ${city.name} — Local creators, clips & communities`;
    desc?.setAttribute(
      'content',
      `Discover VYBE creators, clips, and communities in ${city.name}, ${city.country}. Join the local feed, follow nearby creators, and find your tribe.`,
    );
    canonical?.setAttribute('href', `https://vybehub.app/local/${city.slug}`);

    // Inject city JSON-LD
    const ld = document.createElement('script');
    ld.type = 'application/ld+json';
    ld.id = 'city-jsonld';
    ld.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Place',
      name: `VYBE — ${city.name}`,
      url: `https://vybehub.app/local/${city.slug}`,
      address: {
        '@type': 'PostalAddress',
        addressLocality: city.name,
        addressRegion: city.region,
        addressCountry: city.countryCode,
      },
      description: city.blurb,
    });
    document.head.appendChild(ld);

    return () => {
      document.title = prevTitle;
      if (prevDesc) desc?.setAttribute('content', prevDesc);
      if (prevCanon) canonical?.setAttribute('href', prevCanon);
      document.getElementById('city-jsonld')?.remove();
    };
  }, [city]);

  if (!slug) return <Navigate to="/local" replace />;
  if (!city) return <Navigate to="/local" replace />;

  const others = CITIES.filter((c) => c.slug !== city.slug).slice(0, 8);

  return (
    <div className="page-scroll-fix bg-background">
      <div className="max-w-5xl mx-auto p-4 sm:p-6">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>

        <motion.header initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
            <MapPin className="w-4 h-4" />
            <span>{city.region}, {city.country}</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold mb-4 bg-gradient-to-r from-primary via-purple-400 to-cyan-400 bg-clip-text text-transparent">
            VYBE in {city.name}
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl">{city.blurb}</p>
        </motion.header>

        <section className="grid sm:grid-cols-3 gap-4 mb-10">
          <article className="rounded-2xl border border-border bg-card p-5">
            <Users className="w-5 h-5 text-primary mb-2" />
            <h2 className="font-semibold mb-1">Local creators</h2>
            <p className="text-sm text-muted-foreground">Follow rising creators based in {city.name} and nearby.</p>
          </article>
          <article className="rounded-2xl border border-border bg-card p-5">
            <MapIcon className="w-5 h-5 text-primary mb-2" />
            <h2 className="font-semibold mb-1">Friend Map</h2>
            <p className="text-sm text-muted-foreground">See where friends are vibing across {city.name} in real time. Ghost Mode included.</p>
          </article>
          <article className="rounded-2xl border border-border bg-card p-5">
            <Sparkles className="w-5 h-5 text-primary mb-2" />
            <h2 className="font-semibold mb-1">Local feed</h2>
            <p className="text-sm text-muted-foreground">A 25-mile radius feed surfaces clips, posts, and events near you.</p>
          </article>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 mb-10">
          <h2 className="text-xl font-bold mb-3">Popular vibes in {city.name}</h2>
          <div className="flex flex-wrap gap-2">
            {city.vibes.map((v) => (
              <span key={v} className="px-3 py-1 rounded-full bg-primary/10 text-primary text-sm">{v}</span>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 mb-10 text-center">
          <h2 className="text-2xl font-bold mb-2">Join {city.name} on VYBE</h2>
          <p className="text-muted-foreground mb-4">Create a free account and start vibing with local creators today.</p>
          <Button asChild size="lg">
            <Link to="/?signup=true">Create your free account</Link>
          </Button>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-bold mb-4">Explore other cities</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {others.map((c) => (
              <Link key={c.slug} to={`/local/${c.slug}`} className="rounded-xl border border-border bg-card p-3 hover:border-primary/40 transition-colors">
                <div className="font-semibold text-foreground">{c.name}</div>
                <div className="text-xs text-muted-foreground">{c.country}</div>
              </Link>
            ))}
          </div>
        </section>

        <PublicFooter />
      </div>
    </div>
  );
}
