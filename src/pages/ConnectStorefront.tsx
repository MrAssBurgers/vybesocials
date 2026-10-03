import { Link } from 'react-router-dom';
import { ShoppingBag } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageTransition } from '@/components/ui/PageTransition';
import { Button } from '@/components/ui/button';

/**
 * Public seller storefronts need a seller-scoped listing and checkout contract.
 * connectV2ListProducts currently lists the caller's own connected account and
 * returns unexpanded prices; connectV2Checkout does not accept account_id.
 * Do not invoke either as a substitute: it could show the wrong seller's catalog.
 * The account owner's ConnectDashboard is independent and remains available.
 */
export default function ConnectStorefront() {
  return (
    <AppLayout>
      <PageTransition>
        <section className="mx-auto w-full max-w-2xl px-4 py-8">
          <h1 className="mb-6 text-2xl font-bold tracking-tight">Storefront</h1>
          <div className="rounded-3xl border border-border/30 bg-card/80 p-8 text-center">
            <ShoppingBag aria-hidden className="mx-auto mb-4 h-10 w-10 text-primary" />
            <h2 className="text-xl font-semibold">Storefront unavailable</h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
              Product browsing and checkout for individual sellers are not available here yet.
              You can continue browsing VYBE Marketplace.
            </p>
            <Button asChild className="mt-6" variant="outline"><Link to="/market">Back to Marketplace</Link></Button>
          </div>
        </section>
      </PageTransition>
    </AppLayout>
  );
}
