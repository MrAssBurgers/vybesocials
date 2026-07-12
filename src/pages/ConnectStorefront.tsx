/**
 * ConnectStorefront
 * ─────────────────
 * A public-facing storefront for a specific connected account.
 * Displays all active products and allows customers to buy via
 * Stripe Checkout (direct charge with application fee).
 *
 * URL pattern: /connect/storefront/:accountId
 *
 * NOTE: In production, you should use a slug or business name
 * instead of the raw Stripe account ID in the URL.  The account ID
 * is used here for demo simplicity.
 */

import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { ShoppingBag } from 'lucide-react';
import { db } from '@/lib/firebase';
import { toast } from 'sonner';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageTransition } from '@/components/ui/PageTransition';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils';

interface Product {
  id: string;
  name: string;
  description: string | null;
  images: string[];
  default_price: {
    id: string;
    unit_amount: number;
    currency: string;
  } | null;
}

export default function ConnectStorefront() {
  // The account ID is in the URL.
  // TODO: In production, use a business slug and look up the account ID from your DB.
  const { accountId } = useParams<{ accountId: string }>();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [buyingId, setBuyingId] = useState<string | null>(null);

  useEffect(() => {
    if (!accountId) return;

    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await db.functions.invoke(
          `connect-v2-list-products?account_id=${accountId}`,
          { method: 'GET' },
        );
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        setProducts(data.products || []);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Failed to load products';
        toast.error(message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [accountId]);

  const handleBuy = async (product: Product) => {
    if (!accountId || !product.default_price) return;
    setBuyingId(product.id);
    try {
      const { data, error } = await db.functions.invoke('connect-v2-checkout', {
        body: {
          account_id: accountId,
          price_id: product.default_price.id,
          quantity: 1,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.url) window.location.href = data.url;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Checkout failed';
      toast.error(message);
    } finally {
      setBuyingId(null);
    }
  };

  const formatPrice = (amount: number, currency: string) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount / 100);

  return (
    <AppLayout>
      <PageTransition>
        <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8">
          <header className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight">Storefront</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Browse products from this seller.
            </p>
          </header>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="liquid-glass-card rounded-2xl border border-border/30 p-5 space-y-3"
                >
                  <Skeleton className="w-full h-36 rounded-xl" />
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                  <div className="flex items-center justify-between pt-2">
                    <Skeleton className="h-6 w-16" />
                    <Skeleton className="h-9 w-20 rounded-lg" />
                  </div>
                </div>
              ))}
            </div>
          ) : products.length === 0 ? (
            <EmptyState
              icon={<ShoppingBag className="h-10 w-10 text-primary" />}
              title="No products yet"
              description="This seller hasn't listed anything for sale."
              className="liquid-glass-card rounded-2xl border border-border/30"
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {products.map((product) => (
                <article
                  key={product.id}
                  className={cn(
                    'liquid-glass-card rounded-2xl border border-border/30 p-5',
                    'flex flex-col justify-between gap-4',
                  )}
                >
                  {product.images?.[0] && (
                    <img
                      src={product.images[0]}
                      alt={product.name}
                      className="w-full h-36 object-cover rounded-xl"
                      loading="lazy"
                      decoding="async"
                    />
                  )}

                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-base">{product.name}</h3>
                    {product.description && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {product.description}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span className="text-lg font-bold">
                      {product.default_price
                        ? formatPrice(
                            product.default_price.unit_amount,
                            product.default_price.currency,
                          )
                        : 'N/A'}
                    </span>
                    <Button
                      size="sm"
                      onClick={() => handleBuy(product)}
                      disabled={buyingId === product.id || !product.default_price}
                    >
                      {buyingId === product.id ? 'Loading…' : 'Buy'}
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </PageTransition>
    </AppLayout>
  );
}
