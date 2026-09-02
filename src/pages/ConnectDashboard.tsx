/**
 * ConnectDashboard
 * ────────────────
 * The main dashboard for a Stripe Connect V2 connected account owner.
 *
 * Hosted Stripe pages always open through the shared platform payment helper,
 * keeping them out of the embedded app WebView.
 */

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { openStripeHostedUrl } from "@/lib/platformPayments";
import { toast } from "sonner";

interface AccountStatus {
  account_id: string;
  display_name: string | null;
  ready_to_process_payments: boolean;
  onboarding_complete: boolean;
  requirements_status: string;
  details: { card_payments_status: string };
}

export default function ConnectDashboard() {
  const { user, profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const accountIdFromUrl = searchParams.get("accountId");

  const [accountId, setAccountId] = useState(accountIdFromUrl || "");
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [loading, setLoading] = useState(false);

  const [productName, setProductName] = useState("");
  const [productDesc, setProductDesc] = useState("");
  const [productPrice, setProductPrice] = useState("");

  const fetchStatus = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    try {
      const { data, error } = await db.functions.invoke("connect-v2-account-status", {
        body: { account_id: id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setStatus(data);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to fetch account status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (accountIdFromUrl) {
      setAccountId(accountIdFromUrl);
      void fetchStatus(accountIdFromUrl);
    }
  }, [accountIdFromUrl, fetchStatus]);

  const handleCreateAccount = async () => {
    if (!user?.email) {
      toast.error("Sign in with a verified email before connecting Stripe.");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await db.functions.invoke("connect-v2-create-account", {
        body: {
          display_name: profile?.display_name || profile?.username || "VYBE Creator",
          contact_email: user.email,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const newId = data.account_id;
      setAccountId(newId);
      setSearchParams({ accountId: newId });
      toast.success("Stripe account created");
      void fetchStatus(newId);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to create account");
    } finally {
      setLoading(false);
    }
  };

  const openHostedStripeResult = (url: unknown, fallbackMessage: string) => {
    if (typeof url !== "string" || !openStripeHostedUrl(url)) {
      throw new Error(fallbackMessage);
    }
  };

  const handleOnboard = async () => {
    if (!accountId || loading) return;
    setLoading(true);
    try {
      const { data, error } = await db.functions.invoke("connect-v2-account-link", {
        body: { account_id: accountId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      openHostedStripeResult(data?.url, "Could not open secure Stripe onboarding");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to create onboarding link");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProduct = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accountId) return;
    const parsedPrice = Number.parseFloat(productPrice);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0.5) {
      toast.error("Enter a valid price of at least $0.50");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await db.functions.invoke("connect-v2-create-product", {
        body: {
          account_id: accountId,
          name: productName.trim(),
          description: productDesc.trim() || undefined,
          price_cents: Math.round(parsedPrice * 100),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Product "${productName}" created!`);
      setProductName("");
      setProductDesc("");
      setProductPrice("");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to create product");
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async () => {
    if (!accountId || loading) return;
    setLoading(true);
    try {
      const { data, error } = await db.functions.invoke("connect-v2-subscription", {
        body: { account_id: accountId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      openHostedStripeResult(data?.url, "Could not open secure Stripe checkout");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to start subscription");
    } finally {
      setLoading(false);
    }
  };

  const handleBillingPortal = async () => {
    if (!accountId || loading) return;
    setLoading(true);
    try {
      const { data, error } = await db.functions.invoke("connect-v2-billing-portal", {
        body: { account_id: accountId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      openHostedStripeResult(data?.url, "Could not open the secure billing portal");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to open billing portal");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-4 sm:p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Stripe Connect V2 Dashboard</h1>

      {!accountId ? (
        <section className="rounded-xl border border-border bg-card p-6 mb-6">
          <h2 className="text-lg font-semibold mb-2">Get Started</h2>
          <p className="text-muted-foreground text-sm mb-4">
            Create a new Stripe Connected Account to start accepting payments.
          </p>
          <button
            onClick={handleCreateAccount}
            disabled={loading || !user?.email}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50 transition"
          >
            {loading ? "Creating…" : "Create Connected Account"}
          </button>
        </section>
      ) : (
        <>
          <section className="rounded-xl border border-border bg-card p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Account Status</h2>
              <button
                onClick={() => void fetchStatus(accountId)}
                disabled={loading}
                className="text-sm text-primary hover:underline disabled:opacity-50"
              >
                Refresh
              </button>
            </div>

            <div className="text-xs font-mono text-muted-foreground mb-3 break-all">
              Account ID: {accountId}
            </div>

            {status ? (
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${status.ready_to_process_payments ? "bg-green-500" : "bg-amber-500"}`} />
                  <span>
                    Card Payments: <strong>{status.details.card_payments_status}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${status.onboarding_complete ? "bg-green-500" : "bg-amber-500"}`} />
                  <span>
                    Onboarding: <strong>{status.onboarding_complete ? "Complete" : "Incomplete"}</strong>
                    {status.requirements_status !== "none" && (
                      <span className="text-muted-foreground ml-1">
                        ({status.requirements_status})
                      </span>
                    )}
                  </span>
                </div>
                {status.display_name && (
                  <div className="text-muted-foreground">Name: {status.display_name}</div>
                )}
              </div>
            ) : loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : null}

            {status && !status.onboarding_complete && (
              <button
                onClick={handleOnboard}
                disabled={loading}
                className="mt-4 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50 transition"
              >
                {loading ? "Loading…" : "Onboard to Collect Payments"}
              </button>
            )}
          </section>

          <section className="rounded-xl border border-border bg-card p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">Create a Product</h2>
            <form onSubmit={handleCreateProduct} className="space-y-3">
              <input
                type="text"
                aria-label="Product name"
                placeholder="Product name"
                value={productName}
                onChange={(event) => setProductName(event.target.value)}
                required
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                type="text"
                aria-label="Product description"
                placeholder="Description (optional)"
                value={productDesc}
                onChange={(event) => setProductDesc(event.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                type="number"
                aria-label="Price in US dollars"
                step="0.01"
                min="0.50"
                placeholder="Price (USD)"
                value={productPrice}
                onChange={(event) => setProductPrice(event.target.value)}
                required
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="submit"
                disabled={loading || !productName.trim() || !productPrice}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50 transition"
              >
                {loading ? "Creating…" : "Create Product"}
              </button>
            </form>

            <p className="mt-4 text-sm text-muted-foreground">
              View your{" "}
              <a href={`/connect/storefront/${accountId}`} className="text-primary underline">
                storefront →
              </a>
            </p>
          </section>

          <section className="rounded-xl border border-border bg-card p-6 mb-6">
            <h2 className="text-lg font-semibold mb-2">Platform Subscription</h2>
            <p className="text-muted-foreground text-sm mb-4">
              Subscribe to the platform to unlock premium features.
            </p>
            <div className="flex gap-3 flex-wrap">
              <button
                onClick={handleSubscribe}
                disabled={loading}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50 transition"
              >
                Subscribe
              </button>
              <button
                onClick={handleBillingPortal}
                disabled={loading}
                className="px-4 py-2 rounded-lg border border-border bg-background font-medium hover:bg-accent disabled:opacity-50 transition"
              >
                Manage Subscription
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
