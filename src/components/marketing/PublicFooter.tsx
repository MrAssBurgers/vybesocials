import { Link } from 'react-router-dom';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import { VybeWordmark } from '@/components/ui/VybeWordmark';
import { CITIES } from '@/content/cities';

/**
 * Public, crawlable footer used on all marketing/legal pages and the landing screen.
 * Critical for SEO + AdSense: gives Google's crawler a sitemap of indexable content.
 */
export function PublicFooter() {
  const year = new Date().getFullYear();
  const featuredCities = CITIES.slice(0, 8);
  return (
    <footer className="mt-12 border-t border-border pt-8 pb-6 text-sm text-muted-foreground">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mb-8">
        <div>
          <h3 className="font-semibold text-foreground mb-3">Product</h3>
          <ul className="space-y-2">
            <li><Link to="/features" className="hover:text-primary">Features</Link></li>
            <li><Link to="/safety" className="hover:text-primary">Safety</Link></li>
            <li><Link to="/faq" className="hover:text-primary">FAQ</Link></li>
            <li><Link to="/blog" className="hover:text-primary">Blog</Link></li>
            <li><Link to="/local" className="hover:text-primary">VYBE Local</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="font-semibold text-foreground mb-3">Company</h3>
          <ul className="space-y-2">
            <li><Link to="/about" className="hover:text-primary">About</Link></li>
            <li><Link to="/contact" className="hover:text-primary">Contact</Link></li>
            <li><Link to="/guidelines" className="hover:text-primary">Community Guidelines</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="font-semibold text-foreground mb-3">Legal</h3>
          <ul className="space-y-2">
            <li><Link to="/privacy" className="hover:text-primary">Privacy</Link></li>
            <li><Link to="/terms" className="hover:text-primary">Terms</Link></li>
            <li><Link to="/cookies" className="hover:text-primary">Cookies</Link></li>
            <li><Link to="/child-safety" className="hover:text-primary">Child Safety</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="font-semibold text-foreground mb-3">Account</h3>
          <ul className="space-y-2">
            <li><Link to="/?signup=true" className="hover:text-primary">Sign up</Link></li>
            <li><Link to="/?mode=login" className="hover:text-primary">Log in</Link></li>
            <li><Link to="/delete-account" className="hover:text-primary">Delete account</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border pt-6 mb-6">
        <h3 className="font-semibold text-foreground mb-3">VYBE in your city</h3>
        <ul className="flex flex-wrap gap-x-4 gap-y-2">
          {featuredCities.map((c) => (
            <li key={c.slug}>
              <Link to={`/local/${c.slug}`} className="hover:text-primary">{c.name}</Link>
            </li>
          ))}
          <li><Link to="/local" className="hover:text-primary font-medium">All cities →</Link></li>
        </ul>
      </div>
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border pt-6">
        <Link to="/" className="flex items-center gap-2 text-foreground">
          <VybeMiniIcon className="w-5 h-5" />
          <VybeWordmark size="sm" />
        </Link>
        <p className="text-xs">© {year} Vybe Studios. All rights reserved.</p>
      </div>
    </footer>
  );
}
