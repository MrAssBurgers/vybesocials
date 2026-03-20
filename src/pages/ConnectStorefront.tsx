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

import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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

  // ── Load products from the connected account ─────────────────────────
  useEffect(() => {
    if (!accountId) return;

    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke(
          `connect-v2-list-products?account_id=${accountId}`,
          { method: "GET" },
        );
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        setProducts(data.products || []);
      } catch (e: any) {
        toast.error(e.message || "Failed to load products");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [accountId]);

  // ── Buy a product (direct charge checkout) ───────────────────────────
  const handleBuy = async (product: Product) => {
    if (!accountId || !product.default_price) return;
    setBuyingId(product.id);
    try {
      const { data, error } = await supabase.functions.invoke("connect-v2-checkout", {
        body: {
          account_id: accountId,
          product_name: product.name,
          price_cents: product.default_price.unit_amount,
          quantity: 1,
          currency: product.default_price.currency,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.url) window.location.href = data.url;
    } catch (e: any) {
      toast.error(e.message || "Checkout failed");
    } finally {
      setBuyingId(null);
    }
  };

  // ── Format currency ──────────────────────────────────────────────────
  const formatPrice = (amount: number, currency: string) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount / 100);

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background text-foreground p-4 sm:p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Storefront</h1>
      <p className="text-muted-foreground text-sm mb-6">
        Browse products from this seller.
      </p>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-5 animate-pulse h-48" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
          No products yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((product) => (
            <div
              key={product.id}
              className="rounded-xl border border-border bg-card p-5 flex flex-col justify-between"
            >
              {/* Product image (if any) */}
              {product.images?.[0] && (
                <img
                  src={product.images[0]}
                  alt={product.name}
                  className="w-full h-36 object-cover rounded-lg mb-3"
                />
              )}

              <div>
                <h3 className="font-semibold text-base">{product.name}</h3>
                {product.description && (
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                    {product.description}
                  </p>
                )}
              </div>

              <div className="mt-4 flex items-center justify-between">
                <span className="text-lg font-bold">
                  {product.default_price
                    ? formatPrice(product.default_price.unit_amount, product.default_price.currency)
                    : "N/A"}
                </span>
                <button
                  onClick={() => handleBuy(product)}
                  disabled={buyingId === product.id || !product.default_price}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition"
                >
                  {buyingId === product.id ? "Loading…" : "Buy"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
